/*
*******************************************************************
handlers/services/mailService.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
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
      <div class="code" style="font-size: 24px; letter-spacing: 4px; font-weight: bold;">${code}</div>
      <p>请尽快输入验证码。<br />Please enter the code as soon as possible.</p>
      <p>如非本人操作请忽略此邮件。<br />If you did not request this email, please ignore it.</p>`
    );

  return await c.var.app.mail.send(to, "Your DN42 Authentication Code", html);
}
