import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../utils/verifyToken';
import config from '../../config';
import { Secret } from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { UserRoleEnum } from '@prisma/client';


interface ExtendedWebSocket extends WebSocket {
  userId?: string;
  role?: UserRoleEnum; 
}

export const onlineUsers = new Set<string>();
const userSockets = new Map<string, ExtendedWebSocket>();

// New: Validation function for allowed role pairs
function isValidChatPair(
  senderRole: UserRoleEnum,
  receiverRole: UserRoleEnum,
): boolean {
  return (
    (senderRole === 'ATHLETE' &&
      (receiverRole === 'COACH' || receiverRole === 'ADMIN')) ||
    (senderRole === 'COACH' &&
      (receiverRole === 'ATHLETE' || receiverRole === 'ADMIN')) ||
    (senderRole === 'ADMIN' &&
      (receiverRole === 'ATHLETE' || receiverRole === 'COACH')) ||
    // Bidirectional, so symmetric
    (receiverRole === 'ATHLETE' &&
      (senderRole === 'COACH' || senderRole === 'ADMIN')) ||
    (receiverRole === 'COACH' &&
      (senderRole === 'ATHLETE' || senderRole === 'ADMIN')) ||
    (receiverRole === 'ADMIN' &&
      (senderRole === 'ATHLETE' || senderRole === 'COACH'))
  );
}

export async function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });
  console.log('WebSocket server is running');

  wss.on('connection', (ws: ExtendedWebSocket) => {

    ws.on('message', async (data: string) => {
      try {
        const parsedData = JSON.parse(data);
        console.log('Received event:', parsedData.event, parsedData);

        switch (parsedData.event) {
          case 'authenticate': {
            const token = parsedData.token;
            if (!token) {
              console.log('No token provided');
              ws.send(JSON.stringify({ event: 'error', message: 'No token' }));
              ws.close();
              return;
            }

            const user = verifyToken(token, config.jwt.access_secret as Secret);
            if (!user) {
              console.log('Invalid token');
              ws.send(
                JSON.stringify({ event: 'error', message: 'Invalid token' }),
              );
              ws.close();
              return;
            }

            const { id, role } = user; // role extract করো
            ws.userId = id;
            ws.role = role as UserRoleEnum; // Changed: actual role set করো
            onlineUsers.add(id);
            userSockets.set(id, ws);
            console.log('User authenticated:', id, 'Role:', role);

            broadcastToAll(wss, {
              event: 'userStatus',
              data: { userId: id, role: role, isOnline: true }, // role add করো broadcast-এ
            });
            break;
          }

          // One-to-One Message (Updated with role validation)
          case 'message': {
            const { receiverId, message } = parsedData;
            if (!ws.userId || !ws.role || !receiverId || !message) {
              console.log('Invalid message payload');
              ws.send(
                JSON.stringify({ event: 'error', message: 'Invalid payload' }),
              );
              return;
            }

            // Fetch receiver role
            const receiverUser = await prisma.user.findUnique({
              where: { id: receiverId },
              select: { role: true },
            });
            if (!receiverUser) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Receiver not found',
                }),
              );
              return;
            }
            const receiverRole = receiverUser.role;

            // Role validation
            if (!isValidChatPair(ws.role, receiverRole)) {
              console.log('Invalid role pair:', ws.role, '->', receiverRole);
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Messaging not allowed between these roles',
                }),
              );
              return;
            }

            let room = await prisma.room.findFirst({
              where: {
                OR: [
                  { senderId: ws.userId, receiverId },
                  { senderId: receiverId, receiverId: ws.userId },
                ],
              },
            });

            if (!room) {
              room = await prisma.room.create({
                data: { senderId: ws.userId, receiverId },
              });
              console.log('Room created:', room.id);
            }

            const chat = await prisma.chat.create({
              data: {
                senderId: ws.userId,
                receiverId,
                roomId: room.id,
                message,
              },
            });
            console.log('Chat saved to DB:', chat.id);

            const receiverSocket = userSockets.get(receiverId);
            if (receiverSocket) {
              receiverSocket.send(
                JSON.stringify({ event: 'message', data: chat }),
              );
            }
            ws.send(JSON.stringify({ event: 'message', data: chat })); // Echo to sender
            break;
          }

          // FreeStyleMessage (Updated similarly)
          case 'freeStyleMessage': {
            const { receiverId, message } = parsedData;
            if (!ws.userId || !ws.role || !receiverId || !message) {
              ws.send(
                JSON.stringify({ event: 'error', message: 'Invalid payload' }),
              );
              return;
            }

            const receiverUser = await prisma.user.findUnique({
              where: { id: receiverId },
              select: { role: true },
            });
            if (!receiverUser) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Receiver not found',
                }),
              );
              return;
            }
            const receiverRole = receiverUser.role;

            if (!isValidChatPair(ws.role, receiverRole)) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Messaging not allowed between these roles',
                }),
              );
              return;
            }

            let room = await prisma.room.findFirst({
              where: {
                OR: [
                  { senderId: ws.userId, receiverId },
                  { senderId: receiverId, receiverId: ws.userId },
                ],
              },
            });

            if (!room) {
              room = await prisma.room.create({
                data: { senderId: ws.userId, receiverId },
              });
              console.log('Room created:', room.id);
            }

            const chat = await prisma.chat.create({
              data: {
                senderId: ws.userId,
                receiverId,
                roomId: room.id,
                message,
              },
            });
            console.log('FreeStyle Chat saved:', chat.id);

            const receiverSocket = userSockets.get(receiverId);
            if (receiverSocket) {
              receiverSocket.send(
                JSON.stringify({ event: 'freeStyleMessage', data: chat }),
              );
            }
            ws.send(JSON.stringify({ event: 'freeStyleMessage', data: chat }));
            break;
          }

          // Fetch Chats (Updated with role validation)
          case 'fetchChats': {
            const { receiverId } = parsedData;
            if (!ws.userId || !ws.role || !receiverId) {
              ws.send(
                JSON.stringify({ event: 'error', message: 'Invalid payload' }),
              );
              return;
            }

            const receiverUser = await prisma.user.findUnique({
              where: { id: receiverId },
              select: { role: true },
            });
            if (!receiverUser || !isValidChatPair(ws.role, receiverUser.role)) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Access denied for this chat',
                }),
              );
              return;
            }

            const room = await prisma.room.findFirst({
              where: {
                OR: [
                  { senderId: ws.userId, receiverId },
                  { senderId: receiverId, receiverId: ws.userId },
                ],
              },
            });

            if (!room) {
              ws.send(JSON.stringify({ event: 'fetchChats', data: [] }));
              return;
            }

            const chats = await prisma.chat.findMany({
              where: { roomId: room.id },
              orderBy: { createdAt: 'asc' },
              include: {
                sender: { select: { id: true, fullName: true, role: true } }, // role add করো
                receiver: { select: { id: true, fullName: true, role: true } },
              },
            });

            // Mark unread as read
            await prisma.chat.updateMany({
              where: { roomId: room.id, receiverId: ws.userId, isRead: false },
              data: { isRead: true },
            });
            console.log('Chats marked as read for user:', ws.userId);

            ws.send(JSON.stringify({ event: 'fetchChats', data: chats }));
            break;
          }

          // unReadMessages (Updated similarly)
          case 'unReadMessages': {
            const { receiverId } = parsedData;
            if (!ws.userId || !ws.role || !receiverId) {
              ws.send(
                JSON.stringify({ event: 'error', message: 'Invalid payload' }),
              );
              return;
            }

            const receiverUser = await prisma.user.findUnique({
              where: { id: receiverId },
              select: { role: true },
            });
            if (!receiverUser || !isValidChatPair(ws.role, receiverUser.role)) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Access denied',
                }),
              );
              return;
            }

            const room = await prisma.room.findFirst({
              where: {
                OR: [
                  { senderId: ws.userId, receiverId },
                  { senderId: receiverId, receiverId: ws.userId },
                ],
              },
            });

            if (!room) {
              ws.send(
                JSON.stringify({
                  event: 'unReadMessages',
                  data: { messages: [], count: 0 },
                }),
              );
              return;
            }

            const unReadMessages = await prisma.chat.findMany({
              where: { roomId: room.id, isRead: false, receiverId: ws.userId },
            });

            ws.send(
              JSON.stringify({
                event: 'unReadMessages',
                data: {
                  messages: unReadMessages,
                  count: unReadMessages.length,
                },
              }),
            );
            break;
          }

          // messageList (Updated: Filter rooms by valid roles)
          case 'messageList': {
            if (!ws.userId || !ws.role) {
              ws.send(
                JSON.stringify({
                  event: 'error',
                  message: 'Not authenticated',
                }),
              );
              return;
            }

            // Fetch all rooms, but filter by valid roles
            const rooms = await prisma.room.findMany({
              where: {
                OR: [{ senderId: ws.userId }, { receiverId: ws.userId }],
              },
              include: {
                chat: { orderBy: { createdAt: 'desc' }, take: 1 },
                sender: { select: { id: true, fullName: true, role: true } },
                receiver: { select: { id: true, fullName: true, role: true } },
              },
            });

            // Filter: Only include rooms where role pair is valid
            const validRooms = rooms.filter(room => {
              const otherUser =
                room.senderId === ws.userId ? room.receiver : room.sender;
              return isValidChatPair(ws.role as UserRoleEnum, otherUser.role);
            });

            const userWithLastMessages = validRooms.map(room => {
              const otherUser =
                room.senderId === ws.userId ? room.receiver : room.sender;
              return {
                user: {
                  id: otherUser.id,
                  fullName: otherUser.fullName,
                  role: otherUser.role,
                }, // role add
                lastMessage: room.chat[0],
              };
            });

            ws.send(
              JSON.stringify({
                event: 'messageList',
                data: userWithLastMessages,
              }),
            );
            break;
          }

          // Online Users (Updated: Include role in response)
          case 'onlineUsers': {
            const onlineUserList = Array.from(onlineUsers);
            const users = await prisma.user.findMany({
              where: { id: { in: onlineUserList } },
              select: { id: true, email: true, role: true },
            });
            // Optional: Filter online users by valid roles for this sender
            const filteredUsers = users.filter(user =>
              isValidChatPair(ws.role!, user.role),
            );
            ws.send(
              JSON.stringify({ event: 'onlineUsers', data: filteredUsers }),
            );
            break;
          }

          // ... Other cases (project, etc.) unchanged

          default:
            console.log('Unknown event:', parsedData.event);
            ws.send(
              JSON.stringify({ event: 'error', message: 'Unknown event' }),
            );
        }
      } catch (error: any) {
        ws.send(
          JSON.stringify({
            event: 'error',
            message: error.message || 'Server error',
          }),
        );
      }
    });

    ws.on('close', () => {
      const extendedWs = ws as ExtendedWebSocket;
      if (extendedWs.userId) {
        const userId = extendedWs.userId;
        const role = extendedWs.role; // role include
        onlineUsers.delete(userId);
        userSockets.delete(userId);
        broadcastToAll(wss, {
          event: 'userStatus',
          data: { userId, role, isOnline: false },
        });
        console.log('User disconnected:', userId, 'Role:', role);
      }
    });

    ws.on('error', error => console.error('WS Error:', error));
  });

  return wss;
}

function broadcastToAll(wss: WebSocketServer, message: object) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
