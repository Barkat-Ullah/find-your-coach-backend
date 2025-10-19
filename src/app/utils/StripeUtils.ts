import httpStatus from 'http-status';
import AppError from '../errors/AppError';
import catchAsync from './catchAsync';
import sendResponse from './sendResponse';
import Stripe from 'stripe';
import config from '../../config';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { PaymentStatus, SubscriptionType } from '@prisma/client';
import { notificationServices } from '../modules/Notification/Notification.service';

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
      config.stripe.stripe_webhook!,
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
        select: { id: true, subscriptionId: true },
      });
      console.log(existingPayment);

      if (existingPayment) {
        await prisma.payment.update({
          where: { stripePaymentId: paymentIntent.id },
          data: {
            status: PaymentStatus.SUCCESS,
            amount: (paymentIntent.amount_received || 0) / 100,
            stripeCustomerId: paymentIntent.customer as string,
          },
        });
        //*try notification
        // const payment = await prisma.payment.findUnique({
        //   where: { id: existingPayment.id },
        //   include: {
        //     coach: { select: { fullName: true } },
        //     subscription: true,
        //   },
        // });
        // if (payment?.coach && payment.subscription) {
        //   await notificationServices.sendToAdmins(
        //     { user: { id: 'system_id' } },
        //     'Payment Succeeded',
        //     `Coach ${payment.coach.fullName} paid $${payment.amount} for ${payment.subscription.title}.`,
        //   );
        // }
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
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId = invoice.subscription as string | null;
      const stripeCustomerId = invoice.customer as string | null;
      const paymentIntentId = invoice.payment_intent as string | null;

      if (!stripeSubscriptionId) {
        console.log('Invoice has no subscription ID, skipping.');
        break;
      }

      // Match by stripeSubscriptionId instead of stripePaymentId
      const existingPayment = await prisma.payment.findFirst({
        where: { stripeSubscriptionId: stripeSubscriptionId },
      });

      if (existingPayment) {
        await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            amount: (invoice.amount_paid || 0) / 100,
            stripePaymentId: paymentIntentId,
            stripeCustomerId: stripeCustomerId ?? undefined,
          },
        });

        const subscription = await prisma.subscription.findUnique({
          where: { id: existingPayment.subscriptionId },
        });

        if (subscription) {
          const startDate = new Date();
          const endDate = new Date();
          if (subscription.duration === SubscriptionType.MONTHLY)
            endDate.setMonth(startDate.getMonth() + 1);
          if (subscription.duration === SubscriptionType.YEARLY)
            endDate.setFullYear(startDate.getFullYear() + 1);

          await prisma.coach.update({
            where: { id: existingPayment.coachId },
            data: {
              subscriptionStart: startDate,
              subscriptionEnd: endDate,
              subscriptionId: subscription.id,
              stripeCustomerId: stripeCustomerId ?? undefined,
            },
          });
          //*try notification
          // const coach = await prisma.coach.findUnique({
          //   where: { id: existingPayment.coachId },
          //   select: { id: true, fullName: true },
          // });

          // await notificationServices.sendToAdmins(
          //   { user: { id: coach?.id, fullName: coach?.fullName } },
          //   'New Coach Subscription Confirmed',
          //   `Coach ${coach?.fullName} paid $${invoice.amount_paid / 100} for ${subscription.title} (${subscription.duration}).`,
          // );
          // console.log('✅ Admins notified for subscription success');
        }

        console.log(`✅ Payment SUCCESS: ${existingPayment.coachId}`);
      } else {
        console.log(
          `⚠️ No payment found for subscription ${stripeSubscriptionId}`,
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
