import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomManager } from './server/roomManager';
import { ClientMessage, ServerMessage } from './src/types/game';
import { validateChatMessage } from './server/chatService';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const roomManager = new RoomManager();

  // Helper to send typed message to socket
  function sendMsg(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // Broadcast state & hands to all sockets in a room
  function broadcastRoomState(roomCode: string) {
    const inst = roomManager.getRoomByCode(roomCode);
    if (!inst) return;

    for (const player of inst.state.players) {
      // Find websocket for player
      wss.clients.forEach((client: any) => {
        if (client.readyState === WebSocket.OPEN && client.playerId === player.id) {
          const hand = inst.hands.get(player.id) || [];
          const msg: ServerMessage = {
            type: 'ROOM_STATE',
            state: inst.state,
            hand,
            myPosition: player.position,
          };
          client.send(JSON.stringify(msg));
        }
      });
    }
  }

  // Broadcast chat message
  function broadcastChat(roomCode: string, chatMsg: any) {
    const inst = roomManager.getRoomByCode(roomCode);
    if (!inst) return;

    inst.state.players.forEach((player) => {
      wss.clients.forEach((client: any) => {
        if (client.readyState === WebSocket.OPEN && client.playerId === player.id) {
          client.send(
            JSON.stringify({
              type: 'CHAT_MESSAGE',
              message: chatMsg,
            })
          );
        }
      });
    });
  }

  // REST API Endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/stats', (req, res) => {
    res.json(roomManager.getStats());
  });

  // WebSocket Connection Handler
  wss.on('connection', (ws: any) => {
    ws.playerId = 'sock_' + Math.random().toString(36).substr(2, 9);

    ws.on('message', (raw: string) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'CREATE_ROOM': {
            const { roomCode, sessionToken } = roomManager.createRoom(
              ws.playerId,
              msg.name,
              msg.settings
            );
            sendMsg(ws, {
              type: 'SESSION_INIT',
              sessionToken,
              player: {
                id: ws.playerId,
                sessionToken,
                name: msg.name,
                position: 'south',
                team: 1,
                isHost: true,
                isReady: true,
                isConnected: true,
                cardsInHandCount: 0,
              },
            });
            broadcastRoomState(roomCode);
            break;
          }

          case 'JOIN_ROOM': {
            const result = roomManager.joinRoom(
              ws.playerId,
              msg.roomCode,
              msg.name,
              msg.sessionToken
            );
            if (!result.success) {
              sendMsg(ws, { type: 'ERROR', message: result.error || 'შესვლა ვერ მოხერხდა' });
            } else {
              const cleanCode = msg.roomCode.toUpperCase().trim();
              const inst = roomManager.getRoomByCode(cleanCode);
              const p = inst?.state.players.find((pl) => pl.sessionToken === result.sessionToken);
              if (p) {
                sendMsg(ws, {
                  type: 'SESSION_INIT',
                  sessionToken: result.sessionToken,
                  player: p,
                });
              }
              broadcastRoomState(cleanCode);
            }
            break;
          }

          case 'JOIN_MATCHMAKING': {
            const res = roomManager.handleMatchmaking(ws.playerId, msg.name, msg.sessionToken);
            sendMsg(ws, {
              type: 'MATCHMAKING_STATUS',
              inQueue: res.inQueue,
              playersFound: res.playersFound,
              queueTimeSeconds: 0,
            });

            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const p = inst.state.players.find((pl) => pl.id === ws.playerId);
              if (p) {
                sendMsg(ws, {
                  type: 'SESSION_INIT',
                  sessionToken: p.sessionToken,
                  player: p,
                });
              }
              broadcastRoomState(inst.state.roomCode);
            }
            break;
          }

          case 'LEAVE_MATCHMAKING': {
            roomManager.leaveMatchmaking(ws.playerId);
            sendMsg(ws, {
              type: 'MATCHMAKING_STATUS',
              inQueue: false,
              playersFound: 0,
              queueTimeSeconds: 0,
            });
            break;
          }

          case 'TOGGLE_READY': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              roomManager.toggleReady(ws.playerId);
              broadcastRoomState(inst.state.roomCode);
            }
            break;
          }

          case 'START_GAME': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const res = roomManager.startGame(ws.playerId);
              if (!res.success) {
                sendMsg(ws, { type: 'ERROR', message: res.error || 'შეცდომა' });
              } else {
                broadcastRoomState(inst.state.roomCode);
              }
            }
            break;
          }

          case 'PLAY_CARDS': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const res = roomManager.playCards(ws.playerId, msg.cardIds);
              if (!res.success) {
                sendMsg(ws, { type: 'ACTION_REJECTED', reason: res.error || 'არასწორი სვლა' });
              } else {
                broadcastRoomState(inst.state.roomCode);
              }
            }
            break;
          }

          case 'PROPOSE_RAISE': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const res = roomManager.proposeRaise(ws.playerId, msg.level);
              if (!res.success) {
                sendMsg(ws, { type: 'ERROR', message: res.error || 'შეცდომა' });
              } else {
                broadcastRoomState(inst.state.roomCode);
              }
            }
            break;
          }

          case 'RESPOND_RAISE': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const res = roomManager.respondRaise(ws.playerId, msg.accept);
              if (!res.success) {
                sendMsg(ws, { type: 'ERROR', message: res.error || 'შეცდომა' });
              } else {
                broadcastRoomState(inst.state.roomCode);
              }
            }
            break;
          }

          case 'DECLARE_BURA': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const res = roomManager.declareBura(ws.playerId);
              if (!res.success) {
                sendMsg(ws, { type: 'ERROR', message: res.error || 'შეცდომა' });
              } else {
                broadcastRoomState(inst.state.roomCode);
              }
            }
            break;
          }

          case 'SEND_CHAT': {
            const inst = roomManager.getRoomBySocket(ws.playerId);
            if (inst) {
              const player = inst.state.players.find((p) => p.id === ws.playerId);
              const senderName = player ? player.name : 'მოთამაშე';
              const val = validateChatMessage(ws.playerId, senderName, msg.text);
              if (val.valid && val.message) {
                inst.chat.push(val.message);
                broadcastChat(inst.state.roomCode, val.message);
              } else if (val.error) {
                sendMsg(ws, { type: 'ERROR', message: val.error });
              }
            }
            break;
          }

          case 'LEAVE_ROOM': {
            const code = roomManager.handleDisconnect(ws.playerId);
            if (code) {
              broadcastRoomState(code);
            }
            break;
          }
        }
      } catch (err) {
        console.error('WS Error:', err);
      }
    });

    ws.on('close', () => {
      const code = roomManager.handleDisconnect(ws.playerId);
      if (code) {
        broadcastRoomState(code);
      }
    });
  });

  // Vite Dev Server or Production Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bura Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
