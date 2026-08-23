document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector("[data-contact-form]");
  if (!form) return;

  var status = document.querySelector("[data-contact-status]");
  var btn = form.querySelector("[data-submit-btn]");
  var RECAPTCHA_SITE_KEY = "6Lc3TnstAAAAAEjg9r4v8T8i-Ui3fpX_S-8gbTcs";

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = "";
    status.style.color = "";

    var payload = {
      type: form.querySelector("#type").value,
      name: form.querySelector("#name").value.trim(),
      email: form.querySelector("#email").value.trim(),
      service: form.querySelector("#service").value,
      subject: form.querySelector("#subject").value.trim(),
      message: form.querySelector("#message").value.trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      status.style.color = "#ff8585";
      status.textContent = "Please fill in all required fields.";
      return;
    }

    btn.disabled = true;
    status.textContent = "Verifying...";

    try {
      // Get reCAPTCHA v3 token
      var recaptchaToken = "";
      if (typeof grecaptcha !== "undefined") {
        recaptchaToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "contact" });
      }
      payload.recaptchaToken = recaptchaToken;

      status.textContent = "Sending...";

      var res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");

      status.style.color = "#85ffaa";
      status.textContent = "Message sent. We will get back to you within 24 hours.";
      form.reset();
    } catch (err) {
      status.style.color = "#ff8585";
      status.textContent = err.message || "Could not send. Please email info@yugmai.in directly.";
    } finally {
      btn.disabled = false;
    }
  });
});
