// server/mailer.js
// Town Capture - Email sender with beautiful template

const nodemailer = require("nodemailer");

let transporter = null;

/* =========================================
   CREATE SMTP TRANSPORT (reused)
========================================= */
function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP_USER / SMTP_PASS missing");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

/* =========================================
   EMAIL TEMPLATE
========================================= */
function buildCaptureEmail({
  customerEmail,
  downloadUrl,
  previewUrl,
  cameraName,
  captureId,
  amount,
}) {
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Town Capture</title>

<style>
body{
  margin:0;
  padding:0;
  background:#f5f7fb;
  font-family:Arial, Helvetica, sans-serif;
}

.container{
  max-width:600px;
  margin:auto;
  background:white;
  border-radius:12px;
  overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.08);
}

.header{
  background:#0f172a;
  color:white;
  padding:28px;
  text-align:center;
}

.header h1{
  margin:0;
  font-size:22px;
  letter-spacing:1px;
}

.content{
  padding:28px;
}

.preview{
  width:100%;
  border-radius:10px;
  margin:20px 0;
}

.button{
  display:inline-block;
  background:#2563eb;
  color:white !important;
  text-decoration:none;
  padding:14px 24px;
  border-radius:8px;
  font-weight:bold;
  margin-top:10px;
}

.info{
  background:#f1f5f9;
  border-radius:8px;
  padding:14px;
  font-size:13px;
  margin-top:20px;
}

.footer{
  text-align:center;
  font-size:12px;
  color:#64748b;
  padding:18px;
}
</style>
</head>

<body>

<div class="container">

<div class="header">
<h1>📸 Town Capture</h1>
</div>

<div class="content">

<h2>ご利用ありがとうございます</h2>

<p>
Town Capture をご利用いただきありがとうございます。<br/>
撮影された写真 / 動画のダウンロード準備ができました。
</p>

${
  previewUrl
    ? `<img class="preview" src="${previewUrl}" />`
    : ""
}

<center>
<a class="button" href="${downloadUrl}">
ダウンロード
</a>
</center>

<div class="info">

<b>Capture ID:</b> ${captureId}<br/>
<b>Camera:</b> ${cameraName || "-"}<br/>
<b>Amount:</b> ¥${amount || "-"}

</div>

<p style="margin-top:24px;font-size:13px;color:#475569">
※ダウンロードリンクは一定時間後に無効になります。
</p>

</div>

<div class="footer">

Town Capture © ${year}<br/>
Auto Cast Capture System

</div>

</div>

</body>
</html>
`;
}

/* =========================================
   SEND CAPTURE EMAIL
========================================= */
async function sendCaptureEmail({
  to,
  downloadUrl,
  previewUrl,
  cameraName,
  captureId,
  amount,
}) {

  const transporter = getTransporter();

  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "no-reply@towncapture.local";

  const html = buildCaptureEmail({
    customerEmail: to,
    downloadUrl,
    previewUrl,
    cameraName,
    captureId,
    amount,
  });

  await transporter.sendMail({
    from,
    to,
    subject: "📸 Town Capture - ダウンロード準備完了",
    html,
  });

  console.log("📧 Email sent:", to);
}

module.exports = {
  sendCaptureEmail,
};