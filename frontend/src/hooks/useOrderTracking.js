import { useEffect, useRef, useState } from "react";
import { getSocket } from "../services/socket.js";
import api from "../services/api.js";

/**
 * Subscribes to realtime updates for a single order: status transitions and
 * live delivery-partner location. Falls back to the initial REST fetch for
 * the order so the page has data immediately, then layers live updates on top.
 */
export const useOrderTracking = (orderId) => {
  const [order, setOrder] = useState(null);
  const [partnerLocation, setPartnerLocation] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!orderId) return;

    let isMounted = true;

    api
      .get(`/orders/${orderId}`)
      .then(({ data }) => {
        if (!isMounted) return;
        setOrder(data);
        setStatus(data.status);
        if (data.deliveryPartner?.currentLocation?.coordinates) {
          setPartnerLocation(data.deliveryPartner.currentLocation.coordinates);
        }
      })
      .catch((err) => isMounted && setError(err.message));

    const socket = getSocket();
    socketRef.current = socket;
    socket.emit("join_order_room", orderId);

    const onStatusUpdate = (payload) => {
      if (payload.orderId === orderId) setStatus(payload.status);
    };
    const onPartnerLocation = (payload) => {
      if (payload.orderId === orderId) setPartnerLocation(payload.coordinates);
    };

    socket.on("order_status_updated", onStatusUpdate);
    socket.on("partner_location_updated", onPartnerLocation);

    return () => {
      isMounted = false;
      socket.emit("leave_order_room", orderId);
      socket.off("order_status_updated", onStatusUpdate);
      socket.off("partner_location_updated", onPartnerLocation);
    };
  }, [orderId]);

  return { order, status, partnerLocation, error };
};
