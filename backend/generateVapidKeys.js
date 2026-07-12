import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("VAPID keys generated. Add these to backend/.env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
console.log("\nThe frontend fetches the public key at runtime from GET /api/notifications/vapid-public-key,");
console.log("so nothing needs to be duplicated into the frontend's own .env.");
