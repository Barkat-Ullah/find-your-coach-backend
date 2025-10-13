import httpStatus from 'http-status';
import AppError from '../errors/AppError';
import catchAsync from './catchAsync';
import sendResponse from './sendResponse';
import Stripe from 'stripe';
import config from '../../config';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { PaymentStatus, SubscriptionType } from '@prisma/client';

// ----------------------
// 🔥 Stripe Webhook Entry
// ----------------------
export const StripeWebHook = catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    throw new AppError(httpStatus.NOT_FOUND, 'Missing Stripe signature');
  }

  const result = await StripeHook(req.body, sig);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Webhook processed successfully',
    data: result,
  });
});

// ----------------------
// ⚙️ Main Stripe Hook Handler
// ----------------------
const StripeHook = async (
  rawBody: Buffer,
  signature: string | string[] | undefined,
) => {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature as string,
      config.stripe.stripe_webhook as string,
    );
  } catch (err) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${(err as Error).message}`,
    );
  }

  switch (event.type) {
    // -------------------------------
    // ✅ PaymentIntent succeeded
    // -------------------------------
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const existingPayment = await prisma.payment.findUnique({
        where: { stripePaymentId: paymentIntent.id },
        select: { id: true },
      });

      if (existingPayment) {
        await prisma.payment.update({
          where: { stripePaymentId: paymentIntent.id },
          data: {
            status: PaymentStatus.SUCCESS,
            amount: (paymentIntent.amount_received || 0) / 100,
            stripeCustomerId: paymentIntent.customer as string,
          },
        });
      } else {
        console.log(
          `No payment record found for PaymentIntent ${paymentIntent.id}`,
        );
      }
      break;
    }

    // -------------------------------
    // ✅ Invoice Payment Succeeded
    // -------------------------------
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
        payment_intent?: string | Stripe.PaymentIntent | null;
      };

      const stripeSubscriptionId =
        (invoice.subscription as string | null) ?? null;
      const stripeCustomerId = invoice.customer as string | null;

      if (!stripeSubscriptionId) {
        console.log('Invoice has no subscription ID, skipping.');
        break;
      }

      const existingPayment = await prisma.payment.findUnique({
        where: { stripeSubscriptionId },
        select: { id: true, coachId: true, subscriptionId: true },
      });

      if (existingPayment) {
        const subscription = await prisma.subscription.findUnique({
          where: { id: existingPayment.subscriptionId },
        });

        if (subscription) {
          const startDate = new Date();
          const endDate = new Date();

          if (subscription.duration === SubscriptionType.MONTHLY) {
            endDate.setMonth(endDate.getMonth() + 1);
          } else if (subscription.duration === SubscriptionType.YEARLY) {
            endDate.setFullYear(endDate.getFullYear() + 1);
          }

          // ✅ Update Coach subscription info
          await prisma.coach.update({
            where: { id: existingPayment.coachId },
            data: {
              subscriptionStart: startDate,
              subscriptionEnd: endDate,
              subscriptionId: subscription.id,
              stripeCustomerId: stripeCustomerId ?? undefined,
            },
          });

          // ✅ Update Payment
          await prisma.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: PaymentStatus.SUCCESS,
              amount: (invoice.amount_paid || 0) / 100,
              stripeCustomerId: stripeCustomerId ?? undefined,
              stripePaymentId:
                (invoice.payment_intent as string | null) ?? undefined,
            },
          });

          console.log(
            `✅ Payment SUCCESS for coach ${existingPayment.coachId}, subscription updated.`,
          );
        }
      } else {
        console.log(
          `⚠️ No local payment record found for Stripe Subscription ID ${stripeSubscriptionId}. Possibly a recurring renewal.`,
        );
      }

      break;
    }

    // -------------------------------
    // ❌ Payment Failed
    // -------------------------------
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const payment = await prisma.payment.findUnique({
        where: { stripePaymentId: paymentIntent.id },
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
      } else {
        console.log('Payment failed but no payment record found.');
      }
      break;
    }

    // -------------------------------
    // 🧾 Checkout Session Completed
    // -------------------------------
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCompleted(session);
      break;
    }

    // -------------------------------
    // 🚫 Checkout Session Expired
    // -------------------------------
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCanceled(session);
      break;
    }

    // -------------------------------
    // 💤 Default
    // -------------------------------
    default:
      console.log('Unhandled Stripe event type:', event.type);
      return { status: 'unhandled_event', type: event.type };
  }

  return { status: 'success', type: event.type };
};

// ----------------------
// 💳 Handle Checkout Completed
// ----------------------
const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session,
) => {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      stripeSessionId: session.id,
      ...(session.mode === 'subscription' &&
        session.subscription && {
          stripeSubscriptionId: session.subscription as string,
        }),
      ...(session.mode === 'payment' &&
        session.payment_intent && {
          stripePaymentId: session.payment_intent as string,
        }),
      status:
        session.mode === 'payment'
          ? PaymentStatus.SUCCESS
          : PaymentStatus.PENDING,
    },
  });

  return prisma.payment.findUnique({ where: { id: paymentId } });
};

// ----------------------
// 🚫 Handle Checkout Expired
// ----------------------
const handleCheckoutSessionCanceled = async (
  session: Stripe.Checkout.Session,
) => {
  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return;

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PaymentStatus.CANCELED,
      stripeSessionId: session.id,
    },
  });

  return prisma.payment.findUnique({ where: { id: paymentId } });
};
