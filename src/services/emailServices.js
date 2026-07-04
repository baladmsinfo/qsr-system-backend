const fs = require("fs");
const path = require("path");
const { emailQueue } = require("../queues/email.queue");

function loadTemplate(name, vars) {
    let tpl = fs.readFileSync(
        path.join(__dirname, "../templates", name),
        "utf-8"
    );
    Object.entries(vars).forEach(([k, v]) => {
        tpl = tpl.replace(new RegExp(`{{${k}}}`, "g"), v);
    });
    return tpl;
}

async function enqueueUserRegistrationEmail({
    to,
    name,
    role,
    email,
    mobile_no,
    password,
}) {
    let templateFile =
        role === "SUPERADMIN"
            ? "company_admin_registration.html"
            : "branch_admin_registration.html";

    const html = loadTemplate(templateFile, {
        to,
        name,
        role,
        email,
        mobile_no,
        password,
        base_url: process.env.FRONTEND_URL || "http://localhost:3000"
    });

    await emailQueue
        .add("sendRegistrationEmail", {
            to,
            cc: "support@bucksbox.in",
            subject: role === "SUPERADMIN" ? "Welcome to Bucksbox - Your Account Details" : "Branch Admin Account Created - Your Login Details",
            html,
        })
        .then((data) => {
            console.log("✅ Email job added:", data.name, data.id);
        })
        .catch((error) => {
            console.log("❌ Error adding email job:", error);
        });
}

async function sendEmailPaymentLink({
    to,
    items,
    amount,
    paymentLink
}) {
    let templateFile = "payment_link_email.html";

    const itemsHtml = items.map(it => `
  <div style="
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e6e6e6;
      font-size: 14px;
      color: #333;
    ">
    
    <div style="max-width: 70%;">
      <div style="font-weight: 600; color:#111;">${it.name}</div>
      <div style="font-size: 13px; color:#777;">Quantity: ${it.quantity}</div>
    </div>

    <div style="text-align:right; min-width: 70px;">
      <div style="font-weight: bold; color:#2c6bff;">₹${it.balance}</div>
    </div>

  </div>
`).join("");

    const html = loadTemplate(templateFile, {
        to,
        items,
        amount,
        paymentLink,
        itemsHtml,
    });

    await emailQueue
        .add("sendPaymentLink", {
            to,
            cc: "support@bucksbox.in",
            subject: "Payment Link",
            html,
        })
        .then((data) => {
            console.log("✅ Email job added:", data.name, data.id);
        })
        .catch((error) => {
            console.log("❌ Error adding email job:", error);
        });
}

module.exports = {
    enqueueUserRegistrationEmail,
    loadTemplate,
    sendEmailPaymentLink
};