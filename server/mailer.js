// server/mailer.js
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
   SIMPLE HTML MAIL
========================================= */
async function sendMail(to, subject, html) {
  const transporter = getTransporter();

  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "no-reply@towncapture.local";

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });

  console.log("📧 Email sent:", to, subject);
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
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AutoCaster View</title>
<style>
body{
  margin:0;
  padding:0;
  background:#f5f7fb;
  font-family:Arial, Helvetica, sans-serif;
  color:#0f172a;
}
.wrapper{
  width:100%;
  background:#f5f7fb;
  padding:24px 12px;
  box-sizing:border-box;
}
.container{
  max-width:600px;
  margin:auto;
  background:#ffffff;
  border-radius:14px;
  overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.08);
}
.header{
  background:#0f172a;
  color:#ffffff;
  padding:28px 24px;
  text-align:center;
}
.header h1{
  margin:0;
  font-size:24px;
  letter-spacing:0.5px;
}
.content{
  padding:28px 24px;
  line-height:1.7;
}
.title{
  margin:0 0 12px;
  font-size:22px;
  color:#111827;
}
.sub{
  margin:0 0 18px;
  font-size:15px;
  color:#334155;
}
.preview{
  width:100%;
  border-radius:12px;
  margin:20px 0;
  display:block;
}
.button-wrap{
  text-align:center;
  margin:28px 0 18px;
}
.button{
  display:inline-block;
  background:#2563eb;
  color:#ffffff !important;
  text-decoration:none;
  padding:14px 28px;
  border-radius:10px;
  font-weight:bold;
  font-size:15px;
}
.note{
  font-size:13px;
  color:#64748b;
  margin-top:14px;
}
.info{
  background:#f8fafc;
  border:1px solid #e2e8f0;
  border-radius:10px;
  padding:16px;
  font-size:13px;
  margin-top:24px;
  line-height:1.8;
}
.info b{
  color:#0f172a;
}
.divider{
  height:1px;
  background:#e5e7eb;
  margin:28px 0;
}
.footer{
  text-align:center;
  font-size:12px;
  color:#64748b;
  padding:18px;
  background:#f8fafc;
}
</style>
</head>
<body>
<div class="wrapper">
  <div class="container">

    <div class="header">
      <h1>📸 AutoCaster View</h1>
    </div>

    <div class="content">
      <h2 class="title">ご利用ありがとうございます</h2>
      <p class="sub">
        AutoCaster View をご利用いただきありがとうございます。<br/>
        撮影された写真 / 動画のダウンロード準備ができました。<br/>
        下のボタンからダウンロードしてください。
      </p>

      ${
        previewUrl
          ? `<img class="preview" src="${previewUrl}" alt="preview" />`
          : ""
      }

      <div class="button-wrap">
        <a class="button" href="${downloadUrl}">ダウンロード</a>
      </div>

      <p class="note">
        ※ダウンロードリンクは <b>1時間以内</b>、<b>最大3回</b>までご利用いただけます。<br/>
        ※期限を過ぎた場合は、再度撮影・ご購入が必要になる場合があります。
      </p>

      <div class="info">
        <b>Capture ID:</b> ${captureId || "-"}<br/>
        <b>Camera:</b> ${cameraName || "-"}<br/>
        <b>Amount:</b> ¥${amount || "-"}
      </div>

      <div class="divider"></div>

      <h2 class="title" style="font-size:20px;">Thank you for using AutoCaster View</h2>
      <p class="sub">
        Your photo / video is now ready for download.<br/>
        Please click the button above to download your file.
      </p>

      <p class="note">
        This download link is valid for <b>1 hour</b> and can be used up to <b>3 times</b>.<br/>
        If the link expires, a new capture / purchase may be required.
      </p>
    </div>

    <div class="footer">
      AutoCaster View © ${year}<br/>
      Auto Cast Capture System
    </div>

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
  const html = buildCaptureEmail({
    customerEmail: to,
    downloadUrl,
    previewUrl,
    cameraName,
    captureId,
    amount,
  });

  await sendMail(
    to,
    "📸 AutoCaster View | 写真・動画のダウンロードのご案内",
    html
  );
}

module.exports = {
  sendMail,
  sendCaptureEmail,
};