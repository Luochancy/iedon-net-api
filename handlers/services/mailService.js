import { readFile } from "fs/promises";

let mailTemplate = null;
async function readTemplate(c) {
  if (!mailTemplate) {
    try {
      mailTemplate = await readFile(
        c.var.app.settings.mailSettings.templateFile,
        "utf8"
      );
    } catch (error) {
      c.var.app.logger
        .getLogger("mail")
        .error(`Error reading mail template. ${error}`);
    }
  }
  return mailTemplate;
}

export async function sendAuthMail(c, to, person, code) {
  const template = await readTemplate(c);
  if (!template) return false;

  const html = template
    .replaceAll("{{title}}", "LuocyNet DN42 Authentication")
    .replaceAll(
      "{{content}}",
      `<p>Hi ${person},</p>
      <p>您正在登录 Auto Peer 系统。<br />You are signing in to Auto Peer.</p>
      <p>您的验证码是：<br />Your verification code is:</p>
      <div class="code">${code}</div>
      <p>请在 5 分钟内使用此验证码。<br />Please use this code within 5 minutes.</p>
      <p>如非本人操作请忽略此邮件。<br />If you did not request this email, please ignore it.</p>`
    );

  return await c.var.app.mail.send(to, "Your DN42 Authentication Code", html);
}
