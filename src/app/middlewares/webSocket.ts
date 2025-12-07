import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../utils/verifyToken';
import config from '../../config';
import { Secret } from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { UserRoleEnum } from '@prisma/client';
import { getUserProfile } from './getUserProfile';

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

            const { id, role } = user;
            ws.userId = id;
            ws.role = role as UserRoleEnum;
            onlineUsers.add(id);
            userSockets.set(id, ws);
            console.log('User authenticated:', id, 'Role:', role);

            const userProfile = await getUserProfile(id, role as UserRoleEnum);

            broadcastToAll(wss, {
              event: 'userStatus',
              data: {
                userId: id,
                role: role,
                isOnline: true,
                profile: userProfile?.profile,
              },
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
              select: {
                role: true,
                admin: { select: { profile: true } },
                coach: { select: { profile: true } },
                athlete: { select: { profile: true } },
              },
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
              include: {
                sender: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
                receiver: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
              },
            });
            const chatWithProfile = {
              ...chat,
              sender: {
                ...chat.sender,
                profile:
                  chat.sender.admin?.profile ||
                  chat.sender.coach?.profile ||
                  chat.sender.athlete?.profile ||
                  null,
              },
              receiver: {
                ...chat.receiver,
                profile:
                  chat.receiver.admin?.profile ||
                  chat.receiver.coach?.profile ||
                  chat.receiver.athlete?.profile ||
                  null,
              },
            };

            console.log('Chat saved to DB:', chat.id);

            const receiverSocket = userSockets.get(receiverId);
            if (receiverSocket) {
              receiverSocket.send(
                JSON.stringify({ event: 'message', data: chatWithProfile }),
              );
            }
            ws.send(
              JSON.stringify({ event: 'message', data: chatWithProfile }),
            );
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
              include: {
                sender: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
                receiver: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
              },
            });
            const chatWithProfile = {
              ...chat,
              sender: {
                ...chat.sender,
                profile:
                  chat.sender.admin?.profile ||
                  chat.sender.coach?.profile ||
                  chat.sender.athlete?.profile ||
                  null,
              },
              receiver: {
                ...chat.receiver,
                profile:
                  chat.receiver.admin?.profile ||
                  chat.receiver.coach?.profile ||
                  chat.receiver.athlete?.profile ||
                  null,
              },
            };

            console.log('FreeStyle Chat saved:', chat.id);

            const receiverSocket = userSockets.get(receiverId);
            if (receiverSocket) {
              receiverSocket.send(
                JSON.stringify({
                  event: 'freeStyleMessage',
                  data: chatWithProfile,
                }),
              );
            }
            ws.send(
              JSON.stringify({
                event: 'freeStyleMessage',
                data: chatWithProfile,
              }),
            );
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
                sender: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
                receiver: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
              },
            });

            // Mark unread as read
            const chatsWithProfiles = chats.map(chat => ({
              ...chat,
              sender: {
                ...chat.sender,
                profile:
                  chat.sender.admin?.profile ||
                  chat.sender.coach?.profile ||
                  chat.sender.athlete?.profile ||
                  null,
              },
              receiver: {
                ...chat.receiver,
                profile:
                  chat.receiver.admin?.profile ||
                  chat.receiver.coach?.profile ||
                  chat.receiver.athlete?.profile ||
                  null,
              },
            }));
            await prisma.chat.updateMany({
              where: { roomId: room.id, receiverId: ws.userId, isRead: false },
              data: { isRead: true },
            });
            console.log('Chats marked as read for user:', ws.userId);

            ws.send(
              JSON.stringify({ event: 'fetchChats', data: chatsWithProfiles }),
            );
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
                sender: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
                receiver: {
                  select: {
                    id: true,
                    fullName: true,
                    role: true,
                    admin: { select: { profile: true } },
                    coach: { select: { profile: true } },
                    athlete: { select: { profile: true } },
                  },
                },
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

              const profile =
                otherUser.admin?.profile ||
                otherUser.coach?.profile ||
                otherUser.athlete?.profile ||
                null;

              return {
                user: {
                  id: otherUser.id,
                  fullName: otherUser.fullName,
                  role: otherUser.role,
                  profile: profile,
                },
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
              select: {
                id: true,
                email: true,
                role: true,
                admin: { select: { profile: true, fullName: true } },
                coach: { select: { profile: true, fullName: true } },
                athlete: { select: { profile: true, fullName: true } },
              },
            });
            const filteredUsers = users
              .filter(user => isValidChatPair(ws.role!, user.role))
              .map(user => ({
                id: user.id,
                email: user.email,
                fullName:
                  user.admin?.fullName ||
                  user.coach?.fullName ||
                  user.athlete?.fullName ||
                  null,
                role: user.role,
                profile:
                  user.admin?.profile ||
                  user.coach?.profile ||
                  user.athlete?.profile ||
                  null,
              }));
            ws.send(
              JSON.stringify({ event: 'onlineUsers', data: filteredUsers }),
            );
            break;
          }

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
        const role = extendedWs.role;
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

// import { Server } from 'http';
// import { WebSocket, WebSocketServer } from 'ws';
// import { verifyToken } from '../utils/verifyToken';
// import config from '../../config';
// import { Secret } from 'jsonwebtoken';
// import { prisma } from '../utils/prisma';
// import { UserRoleEnum } from '@prisma/client';

// interface ExtendedWebSocket extends WebSocket {
//   userId?: string;
//   role?: UserRoleEnum;
// }

// export const onlineUsers = new Set<string>();
// const userSockets = new Map<string, ExtendedWebSocket>();

// // ADDED: Helper function to get user profile based on role
// async function getUserWithProfile(userId: string) {
//   const user = await prisma.user.findUnique({
//     where: { id: userId },
//     select: {
//       id: true,
//       email: true,
//       role: true,
//       // ADDED: Include role-specific profile data
//       admin: {
//         select: {
//           fullName: true,
//           profile: true,
//           phoneNumber: true,
//         },
//       },
//       founder: {
//         select: {
//           fullName: true,
//           profile: true,
//           phoneNumber: true,
//           businessName: true,
//         },
//       },
//       seeder: {
//         select: {
//           fullName: true,
//           profile: true,
//           phoneNumber: true,
//           skill: true,
//           level: true,
//         },
//       },
//     },
//   });

//   if (!user) return null;

//   // ADDED: Extract profile and fullName based on role
//   let fullName = '';
//   let profile = null;

//   if (user.role === 'ADMIN' && user.admin) {
//     fullName = user.admin.fullName;
//     profile = user.admin.profile;
//   } else if (user.role === 'FOUNDER' && user.founder) {
//     fullName = user.founder.fullName;
//     profile = user.founder.profile;
//   } else if (user.role === 'SEEDER' && user.seeder) {
//     fullName = user.seeder.fullName;
//     profile = user.seeder.profile;
//   }

//   return {
//     ...user,
//     fullName,
//     profile,
//   };
// }

// // New: Validation function for allowed role pairs
// function isValidChatPair(
//   senderRole: UserRoleEnum,
//   receiverRole: UserRoleEnum,
// ): boolean {
//   return (
//     (senderRole === 'SEEDER' &&
//       (receiverRole === 'FOUNDER' || receiverRole === 'ADMIN')) ||
//     (senderRole === 'FOUNDER' &&
//       (receiverRole === 'SEEDER' || receiverRole === 'ADMIN')) ||
//     (senderRole === 'ADMIN' &&
//       (receiverRole === 'SEEDER' || receiverRole === 'FOUNDER')) ||
//     // Bidirectional, so symmetric
//     (receiverRole === 'SEEDER' &&
//       (senderRole === 'FOUNDER' || senderRole === 'ADMIN')) ||
//     (receiverRole === 'FOUNDER' &&
//       (senderRole === 'SEEDER' || senderRole === 'ADMIN')) ||
//     (receiverRole === 'ADMIN' &&
//       (senderRole === 'SEEDER' || senderRole === 'FOUNDER'))
//   );
// }

// export async function setupWebSocket(server: Server) {
//   const wss = new WebSocketServer({ server });
//   console.log('WebSocket server is running');

//   wss.on('connection', (ws: ExtendedWebSocket) => {
//     ws.on('message', async (data: string) => {
//       try {
//         const parsedData = JSON.parse(data);
//         console.log('Received event:', parsedData.event, parsedData);

//         switch (parsedData.event) {
//           case 'authenticate': {
//             const token = parsedData.token;
//             if (!token) {
//               console.log('No token provided');
//               ws.send(JSON.stringify({ event: 'error', message: 'No token' }));
//               ws.close();
//               return;
//             }

//             const user = verifyToken(token, config.jwt.access_secret as Secret);
//             if (!user) {
//               console.log('Invalid token');
//               ws.send(
//                 JSON.stringify({ event: 'error', message: 'Invalid token' }),
//               );
//               ws.close();
//               return;
//             }

//             const { id, role } = user;
//             ws.userId = id;
//             ws.role = role as UserRoleEnum;
//             onlineUsers.add(id);
//             userSockets.set(id, ws);
//             console.log('User authenticated:', id, 'Role:', role);

//             // ADDED: Get user profile for broadcast
//             const userProfile = await getUserWithProfile(id);

//             broadcastToAll(wss, {
//               event: 'userStatus',
//               data: {
//                 userId: id,
//                 role: role,
//                 isOnline: true,
//                 // ADDED: Include fullName and profile in broadcast
//                 fullName: userProfile?.fullName,
//                 profile: userProfile?.profile,
//               },
//             });
//             break;
//           }

//           // One-to-One Message (Updated with role validation)
//           case 'message': {
//             const { receiverId, message } = parsedData;
//             if (!ws.userId || !ws.role || !receiverId || !message) {
//               console.log('Invalid message payload');
//               ws.send(
//                 JSON.stringify({ event: 'error', message: 'Invalid payload' }),
//               );
//               return;
//             }

//             // MODIFIED: Fetch receiver role with profile data
//             const receiverUser = await prisma.user.findUnique({
//               where: { id: receiverId },
//               select: {
//                 role: true,
//                 // ADDED: Include role-specific data for validation
//                 admin: { select: { fullName: true, profile: true } },
//                 founder: { select: { fullName: true, profile: true } },
//                 seeder: { select: { fullName: true, profile: true } },
//               },
//             });
//             if (!receiverUser) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Receiver not found',
//                 }),
//               );
//               return;
//             }
//             const receiverRole = receiverUser.role;

//             // Role validation
//             if (!isValidChatPair(ws.role, receiverRole)) {
//               console.log('Invalid role pair:', ws.role, '->', receiverRole);
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Messaging not allowed between these roles',
//                 }),
//               );
//               return;
//             }

//             let room = await prisma.room.findFirst({
//               where: {
//                 OR: [
//                   { senderId: ws.userId, receiverId },
//                   { senderId: receiverId, receiverId: ws.userId },
//                 ],
//               },
//             });

//             if (!room) {
//               room = await prisma.room.create({
//                 data: { senderId: ws.userId, receiverId },
//               });
//               console.log('Room created:', room.id);
//             }

//             // MODIFIED: Create chat with include for sender and receiver profiles
//             const chat = await prisma.chat.create({
//               data: {
//                 senderId: ws.userId,
//                 receiverId,
//                 roomId: room.id,
//                 message,
//               },
//               // ADDED: Include sender and receiver with their role-specific data
//               include: {
//                 sender: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//                 receiver: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//               },
//             });

//             // ADDED: Format chat data with fullName and profile
//             const formattedChat = {
//               ...chat,
//               sender: {
//                 id: chat.sender.id,
//                 email: chat.sender.email,
//                 role: chat.sender.role,
//                 fullName:
//                   chat.sender.admin?.fullName ||
//                   chat.sender.founder?.fullName ||
//                   chat.sender.seeder?.fullName ||
//                   '',
//                 profile:
//                   chat.sender.admin?.profile ||
//                   chat.sender.founder?.profile ||
//                   chat.sender.seeder?.profile ||
//                   null,
//               },
//               receiver: {
//                 id: chat.receiver.id,
//                 email: chat.receiver.email,
//                 role: chat.receiver.role,
//                 fullName:
//                   chat.receiver.admin?.fullName ||
//                   chat.receiver.founder?.fullName ||
//                   chat.receiver.seeder?.fullName ||
//                   '',
//                 profile:
//                   chat.receiver.admin?.profile ||
//                   chat.receiver.founder?.profile ||
//                   chat.receiver.seeder?.profile ||
//                   null,
//               },
//             };

//             console.log('Chat saved to DB:', chat.id);

//             const receiverSocket = userSockets.get(receiverId);
//             if (receiverSocket) {
//               receiverSocket.send(
//                 // MODIFIED: Send formatted chat with profiles
//                 JSON.stringify({ event: 'message', data: formattedChat }),
//               );
//             }
//             // MODIFIED: Send formatted chat to sender
//             ws.send(JSON.stringify({ event: 'message', data: formattedChat }));
//             break;
//           }

//           // FreeStyleMessage (Updated similarly)
//           case 'freeStyleMessage': {
//             const { receiverId, message } = parsedData;
//             if (!ws.userId || !ws.role || !receiverId || !message) {
//               ws.send(
//                 JSON.stringify({ event: 'error', message: 'Invalid payload' }),
//               );
//               return;
//             }

//             const receiverUser = await prisma.user.findUnique({
//               where: { id: receiverId },
//               select: { role: true },
//             });
//             if (!receiverUser) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Receiver not found',
//                 }),
//               );
//               return;
//             }
//             const receiverRole = receiverUser.role;

//             if (!isValidChatPair(ws.role, receiverRole)) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Messaging not allowed between these roles',
//                 }),
//               );
//               return;
//             }

//             let room = await prisma.room.findFirst({
//               where: {
//                 OR: [
//                   { senderId: ws.userId, receiverId },
//                   { senderId: receiverId, receiverId: ws.userId },
//                 ],
//               },
//             });

//             if (!room) {
//               room = await prisma.room.create({
//                 data: { senderId: ws.userId, receiverId },
//               });
//               console.log('Room created:', room.id);
//             }

//             // MODIFIED: Create chat with include for profiles
//             const chat = await prisma.chat.create({
//               data: {
//                 senderId: ws.userId,
//                 receiverId,
//                 roomId: room.id,
//                 message,
//               },
//               // ADDED: Include sender and receiver with profiles
//               include: {
//                 sender: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//                 receiver: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//               },
//             });

//             // ADDED: Format chat data
//             const formattedChat = {
//               ...chat,
//               sender: {
//                 id: chat.sender.id,
//                 email: chat.sender.email,
//                 role: chat.sender.role,
//                 fullName:
//                   chat.sender.admin?.fullName ||
//                   chat.sender.founder?.fullName ||
//                   chat.sender.seeder?.fullName ||
//                   '',
//                 profile:
//                   chat.sender.admin?.profile ||
//                   chat.sender.founder?.profile ||
//                   chat.sender.seeder?.profile ||
//                   null,
//               },
//               receiver: {
//                 id: chat.receiver.id,
//                 email: chat.receiver.email,
//                 role: chat.receiver.role,
//                 fullName:
//                   chat.receiver.admin?.fullName ||
//                   chat.receiver.founder?.fullName ||
//                   chat.receiver.seeder?.fullName ||
//                   '',
//                 profile:
//                   chat.receiver.admin?.profile ||
//                   chat.receiver.founder?.profile ||
//                   chat.receiver.seeder?.profile ||
//                   null,
//               },
//             };

//             console.log('FreeStyle Chat saved:', chat.id);

//             const receiverSocket = userSockets.get(receiverId);
//             if (receiverSocket) {
//               receiverSocket.send(
//                 // MODIFIED: Send formatted chat
//                 JSON.stringify({
//                   event: 'freeStyleMessage',
//                   data: formattedChat,
//                 }),
//               );
//             }
//             // MODIFIED: Send formatted chat to sender
//             ws.send(
//               JSON.stringify({
//                 event: 'freeStyleMessage',
//                 data: formattedChat,
//               }),
//             );
//             break;
//           }

//           // Fetch Chats (Updated with role validation)
//           case 'fetchChats': {
//             const { receiverId } = parsedData;
//             if (!ws.userId || !ws.role || !receiverId) {
//               ws.send(
//                 JSON.stringify({ event: 'error', message: 'Invalid payload' }),
//               );
//               return;
//             }

//             const receiverUser = await prisma.user.findUnique({
//               where: { id: receiverId },
//               select: { role: true },
//             });
//             if (!receiverUser || !isValidChatPair(ws.role, receiverUser.role)) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Access denied for this chat',
//                 }),
//               );
//               return;
//             }

//             const room = await prisma.room.findFirst({
//               where: {
//                 OR: [
//                   { senderId: ws.userId, receiverId },
//                   { senderId: receiverId, receiverId: ws.userId },
//                 ],
//               },
//             });

//             if (!room) {
//               ws.send(JSON.stringify({ event: 'fetchChats', data: [] }));
//               return;
//             }

//             // MODIFIED: Fetch chats with role-specific profile data
//             const chats = await prisma.chat.findMany({
//               where: { roomId: room.id },
//               orderBy: { createdAt: 'asc' },
//               include: {
//                 // MODIFIED: Changed from just email to include profiles
//                 sender: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     // ADDED: Include role-specific data
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//                 receiver: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     // ADDED: Include role-specific data
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//               },
//             });

//             // ADDED: Format all chats with fullName and profile
//             const formattedChats = chats.map(chat => ({
//               ...chat,
//               sender: {
//                 id: chat.sender.id,
//                 email: chat.sender.email,
//                 role: chat.sender.role,
//                 fullName:
//                   chat.sender.admin?.fullName ||
//                   chat.sender.founder?.fullName ||
//                   chat.sender.seeder?.fullName ||
//                   '',
//                 profile:
//                   chat.sender.admin?.profile ||
//                   chat.sender.founder?.profile ||
//                   chat.sender.seeder?.profile ||
//                   null,
//               },
//               receiver: {
//                 id: chat.receiver.id,
//                 email: chat.receiver.email,
//                 role: chat.receiver.role,
//                 fullName:
//                   chat.receiver.admin?.fullName ||
//                   chat.receiver.founder?.fullName ||
//                   chat.receiver.seeder?.fullName ||
//                   '',
//                 profile:
//                   chat.receiver.admin?.profile ||
//                   chat.receiver.founder?.profile ||
//                   chat.receiver.seeder?.profile ||
//                   null,
//               },
//             }));

//             // Mark unread as read
//             await prisma.chat.updateMany({
//               where: { roomId: room.id, receiverId: ws.userId, isRead: false },
//               data: { isRead: true },
//             });
//             console.log('Chats marked as read for user:', ws.userId);

//             // MODIFIED: Send formatted chats
//             ws.send(
//               JSON.stringify({ event: 'fetchChats', data: formattedChats }),
//             );
//             break;
//           }

//           // unReadMessages (Updated similarly)
//           case 'unReadMessages': {
//             const { receiverId } = parsedData;
//             if (!ws.userId || !ws.role || !receiverId) {
//               ws.send(
//                 JSON.stringify({ event: 'error', message: 'Invalid payload' }),
//               );
//               return;
//             }

//             const receiverUser = await prisma.user.findUnique({
//               where: { id: receiverId },
//               select: { role: true },
//             });
//             if (!receiverUser || !isValidChatPair(ws.role, receiverUser.role)) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Access denied',
//                 }),
//               );
//               return;
//             }

//             const room = await prisma.room.findFirst({
//               where: {
//                 OR: [
//                   { senderId: ws.userId, receiverId },
//                   { senderId: receiverId, receiverId: ws.userId },
//                 ],
//               },
//             });

//             if (!room) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'unReadMessages',
//                   data: { messages: [], count: 0 },
//                 }),
//               );
//               return;
//             }

//             const unReadMessages = await prisma.chat.findMany({
//               where: { roomId: room.id, isRead: false, receiverId: ws.userId },
//             });

//             ws.send(
//               JSON.stringify({
//                 event: 'unReadMessages',
//                 data: {
//                   messages: unReadMessages,
//                   count: unReadMessages.length,
//                 },
//               }),
//             );
//             break;
//           }

//           // messageList (Updated: Filter rooms by valid roles)
//           case 'messageList': {
//             if (!ws.userId || !ws.role) {
//               ws.send(
//                 JSON.stringify({
//                   event: 'error',
//                   message: 'Not authenticated',
//                 }),
//               );
//               return;
//             }

//             // MODIFIED: Fetch all rooms with role-specific profile data
//             const rooms = await prisma.room.findMany({
//               where: {
//                 OR: [{ senderId: ws.userId }, { receiverId: ws.userId }],
//               },
//               include: {
//                 chat: { orderBy: { createdAt: 'desc' }, take: 1 },
//                 // MODIFIED: Include role-specific data for sender
//                 sender: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     // ADDED: Include profiles
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//                 // MODIFIED: Include role-specific data for receiver
//                 receiver: {
//                   select: {
//                     id: true,
//                     email: true,
//                     role: true,
//                     // ADDED: Include profiles
//                     admin: { select: { fullName: true, profile: true } },
//                     founder: { select: { fullName: true, profile: true } },
//                     seeder: { select: { fullName: true, profile: true } },
//                   },
//                 },
//               },
//             });

//             // Filter: Only include rooms where role pair is valid
//             const validRooms = rooms.filter(room => {
//               const otherUser =
//                 room.senderId === ws.userId ? room.receiver : room.sender;
//               return isValidChatPair(ws.role as UserRoleEnum, otherUser.role);
//             });

//             // MODIFIED: Map rooms to include fullName and profile
//             const userWithLastMessages = validRooms.map(room => {
//               const otherUser =
//                 room.senderId === ws.userId ? room.receiver : room.sender;

//               // ADDED: Extract fullName and profile based on role
//               const fullName =
//                 otherUser.admin?.fullName ||
//                 otherUser.founder?.fullName ||
//                 otherUser.seeder?.fullName ||
//                 '';
//               const profile =
//                 otherUser.admin?.profile ||
//                 otherUser.founder?.profile ||
//                 otherUser.seeder?.profile ||
//                 null;

//               return {
//                 user: {
//                   id: otherUser.id,
//                   email: otherUser.email,
//                   role: otherUser.role,
//                   // ADDED: Include fullName and profile
//                   fullName: fullName,
//                   profile: profile,
//                 },
//                 lastMessage: room.chat[0],
//               };
//             });

//             ws.send(
//               JSON.stringify({
//                 event: 'messageList',
//                 data: userWithLastMessages,
//               }),
//             );
//             break;
//           }

//           // Online Users (Updated: Include role in response)
//           case 'onlineUsers': {
//             const onlineUserList = Array.from(onlineUsers);
//             // MODIFIED: Fetch users with role-specific profile data
//             const users = await prisma.user.findMany({
//               where: { id: { in: onlineUserList } },
//               select: {
//                 id: true,
//                 email: true,
//                 role: true,
//                 // ADDED: Include role-specific data
//                 admin: { select: { fullName: true, profile: true } },
//                 founder: { select: { fullName: true, profile: true } },
//                 seeder: { select: { fullName: true, profile: true } },
//               },
//             });

//             // Optional: Filter online users by valid roles for this sender
//             const filteredUsers = users
//               .filter(user => isValidChatPair(ws.role!, user.role))
//               // ADDED: Map to include fullName and profile
//               .map(user => ({
//                 id: user.id,
//                 email: user.email,
//                 role: user.role,
//                 fullName:
//                   user.admin?.fullName ||
//                   user.founder?.fullName ||
//                   user.seeder?.fullName ||
//                   '',
//                 profile:
//                   user.admin?.profile ||
//                   user.founder?.profile ||
//                   user.seeder?.profile ||
//                   null,
//               }));

//             ws.send(
//               JSON.stringify({ event: 'onlineUsers', data: filteredUsers }),
//             );
//             break;
//           }

//           default:
//             console.log('Unknown event:', parsedData.event);
//             ws.send(
//               JSON.stringify({ event: 'error', message: 'Unknown event' }),
//             );
//         }
//       } catch (error: any) {
//         ws.send(
//           JSON.stringify({
//             event: 'error',
//             message: error.message || 'Server error',
//           }),
//         );
//       }
//     });

//     ws.on('close', () => {
//       const extendedWs = ws as ExtendedWebSocket;
//       if (extendedWs.userId) {
//         const userId = extendedWs.userId;
//         const role = extendedWs.role;
//         onlineUsers.delete(userId);
//         userSockets.delete(userId);
//         broadcastToAll(wss, {
//           event: 'userStatus',
//           data: { userId, role, isOnline: false },
//         });
//         console.log('User disconnected:', userId, 'Role:', role);
//       }
//     });

//     ws.on('error', error => console.error('WS Error:', error));
//   });

//   return wss;
// }

// function broadcastToAll(wss: WebSocketServer, message: object) {
//   wss.clients.forEach(client => {
//     if (client.readyState === WebSocket.OPEN) {
//       client.send(JSON.stringify(message));
//     }
//   });
// }