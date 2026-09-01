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
    let settled = false;
    let lastFailure = null; // remembers the most recent failed attempt (for messaging only)
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

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
        // A payment succeeded on THIS modal — verify its signature.
        // This is the ONLY place we treat the flow as successful, so a
        // successful retry always overrides any earlier failed attempt.
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
          finish({ success: true, ...res });
        } catch (err) {
          // Signature verification itself failed → this IS a real failure.
          lastFailure = err.message;
          onFailure?.(err);
          finish({ success: false, error: err.message });
        }
      },
      modal: {
        ondismiss: () => {
          // The modal closed. If a payment already succeeded, `settled` is
          // true and this is a no-op. Otherwise the user gave up (possibly
          // after one or more failed attempts) → treat as final failure.
          if (settled) return;
          api
            .paymentFailed({
              razorpay_order_id: order.order_id,
              bookingId,
              name,
              email,
              phone,
              amount,
              sessionName,
              reason: lastFailure || "Payment window closed by the user."
            })
            .catch(() => {});
          onDismiss?.();
          finish({ success: false, dismissed: true, error: lastFailure || undefined });
        }
      }
    });

    // Razorpay's explicit failure event — fires for EACH failed attempt.
    // The modal stays open so the user can retry with another method.
    // We DO NOT settle here; we only remember the reason for messaging and
    // record the failed attempt on the backend. A subsequent successful
    // retry (handler) will win; if the user closes the modal without paying,
    // `ondismiss` finalizes the failure.
    rzp.on("payment.failed", (resp) => {
      if (settled) return;
      const reason = resp?.error?.description || "Payment failed.";
      lastFailure = reason;
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
      // Surface a transient message but keep waiting for retry/dismiss.
      onFailure?.(new Error(reason + " You can try again with another method."));
    });

    rzp.open();
  });
}
