// ============================================================
// Razorpay Standard Checkout helper (frontend).
// Loads the checkout script on demand and opens the payment
// modal. On success/failure it calls back to the caller.
// ============================================================

import api from "./api";

let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Failed to load the Razorpay checkout script."));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Run the full pay flow:
 *  1. create order on the backend
 *  2. open Razorpay modal
 *  3. verify signature on the backend
 * @returns Promise resolving to { success, message } or throwing on error
 */
export async function payWithRazorpay({
  amount, // rupees
  name,
  email,
  phone,
  sessionName,
  bookingId,
  description,
  onSuccess,
  onFailure,
  onDismiss
}) {
  await loadScript();

  // 1) Create the order
  const order = await api.createOrder({
    amount,
    name,
    email,
    phone,
    sessionName,
    bookingId
  });

  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount, // paise
      currency: order.currency || "INR",
      name: "Meenu — German Trainer",
      description: description || sessionName || "Consultation",
      order_id: order.order_id,
      prefill: { name, email, contact: phone },
      // Let Razorpay render all methods enabled on the account (UPI, cards,
      // netbanking, wallets). We do NOT force a custom UPI-only block because
      // in TEST mode UPI may not be enabled on the account, and forcing it
      // would hide every other method / show an empty screen.
      theme: { color: "#DD0000" },
      handler: async (response) => {
        // 3) Verify signature on the backend
        try {
          const res = await api.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            bookingId,
            name,
            email,
            phone,
            amount,
            sessionName
          });
          onSuccess?.(res);
          resolve({ success: true, ...res });
        } catch (err) {
          onFailure?.(err);
          resolve({ success: false, error: err.message });
        }
      },
      modal: {
        ondismiss: () => {
          // User closed the modal without paying
          api
            .paymentFailed({
              razorpay_order_id: order.order_id,
              bookingId,
              name,
              email,
              phone,
              amount,
              sessionName,
              reason: "Payment window closed by the user."
            })
            .catch(() => {});
          onDismiss?.();
          resolve({ success: false, dismissed: true });
        }
      }
    });

    // Razorpay's explicit failure event
    rzp.on("payment.failed", (resp) => {
      const reason = resp?.error?.description || "Payment failed.";
      api
        .paymentFailed({
          razorpay_order_id: order.order_id,
          bookingId,
          name,
          email,
          phone,
          amount,
          sessionName,
          reason
        })
        .catch(() => {});
      onFailure?.(new Error(reason));
      resolve({ success: false, error: reason });
    });

    rzp.open();
  });
}
