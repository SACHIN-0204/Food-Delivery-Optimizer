import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

/**
 * Returns a single shared socket connection for the app. Re-created if the
 * token changes (e.g. after login) since auth is sent at handshake time.
 */
export const getSocket = () => {
  const token = localStorage.getItem("token");

  if (socket && socket.auth?.token === token) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
  });

  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
