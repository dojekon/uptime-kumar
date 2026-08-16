/**
 * IMAP-мониторинг для Uptime Kuma.
 *
 * Три режима (те же значения, что в SmtpSecurity):
 *  - nostarttls: connect → * OK banner → LOGOUT
 *  - secure:     connect → TLS↑ → * OK banner → LOGOUT
 *  - starttls:   connect → * OK banner → STARTTLS → TLS↑ → * OK banner → LOGOUT
 *
 * CAPABILITY не требуется отдельным запросом — баннер IMAP уже содержит
 * список возможностей в квадратных скобках. STARTTLS проверяется по ним же.
 */

const { MonitorType } = require("./monitor-type");
const { UP, PING_GLOBAL_TIMEOUT_DEFAULT: TIMEOUT } = require("../../src/util");
const { checkCertificate } = require("../util-server");
const tls = require("tls");
const net = require("net");
const dayjs = require("dayjs");

// ── Генератор тегов ───────────────────────────────────────────────

/**
 * RFC 3501 §2.2.1: тег — строка из букв/цифр.
 * Генерируем A0001, A0002, …
 */
const makeTag = (() => {
    let counter = 0;
    return () => {
        counter++;
        return `A${counter.toString().padStart(4, "0")}`;
    };
})();

// ── Утилиты IMAP-диалога ──────────────────────────────────────────

/**
 * Читает IMAP-ответ до строки, начинающейся с переданного тега.
 *
 * Все строки до тегированной попадают в untagged.
 * Финальная строка вида "A0001 OK …" определяет status.
 *
 * @param {net.Socket} socket
 * @param {string} tag - тег команды (для баннера передаётся "*")
 * @param {number} timeoutMs
 * @returns {Promise<{status: string, untagged: string[], raw: string}>}
 */
function readImapResponse(socket, tag, timeoutMs) {
    return new Promise((resolve, reject) => {
        const untagged = [];
        let buffer = "";
        let resolved = false;

        const finish = (status) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve({ status, untagged, raw: untagged.join("\n") });
            }
        };

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error("IMAP response timed out"));
            }
        }, timeoutMs);

        const onData = (chunk) => {
            buffer += chunk.toString();
            while (buffer.includes("\r\n")) {
                const idx = buffer.indexOf("\r\n");
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);

                if (line.length === 0) continue;

                if (tag === "*") {
                    if (line.startsWith("* ")) {
                        const parts = line.split(" ");
                        const status = parts[1] || "UNKNOWN";
                        untagged.push(line.slice(2));
                        finish(status);
                        return;
                    }
                    continue;
                }

                if (line.startsWith(tag + " ")) {
                    const parts = line.split(" ");
                    const status = parts[1];
                    finish(status);
                    return;
                }

                untagged.push(line);
            }
        };

        const onError = (err) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(err);
            }
        };

        const onTimeout = () => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error("Socket timed out"));
            }
        };

        function cleanup() {
            clearTimeout(timer);
            socket.off("data", onData);
            socket.off("error", onError);
            socket.off("timeout", onTimeout);
        }

        socket.on("data", onData);
        socket.once("error", onError);
        socket.once("timeout", onTimeout);
    });
}

/**
 * Отправляет тегированную IMAP-команду и читает ответ.
 * Если command === null — только читает баннер (ждёт "* …").
 */
async function imapCommand(socket, command, timeoutMs) {
    if (command) {
        const tag = makeTag();
        socket.write(`${tag} ${command}\r\n`);
        return readImapResponse(socket, tag, timeoutMs);
    }
    return readImapResponse(socket, "*", timeoutMs);
}

/**
 * Парсит IMAP-баннер.
 *
 * "* OK [CAPABILITY IMAP4rev1 SASL-IR …] Dovecot ready."
 *   → { status: "OK", capabilities: ["IMAP4REV1", "SASL-IR", …], text: "Dovecot ready." }
 */
function parseBanner(rawLine) {
    const parts = rawLine.split(" ");
    const status = parts[0] || "UNKNOWN";

    const capMatch = rawLine.match(/\[CAPABILITY\s+([^\]]+)\]/i);
    const capabilities = capMatch
        ? capMatch[1].split(/\s+/).map((s) => s.toUpperCase())
        : [];

    const bracketEnd = rawLine.lastIndexOf("]");
    const text = bracketEnd >= 0
        ? rawLine.slice(bracketEnd + 1).trim()
        : rawLine.slice(status.length).trim();

    return { status, capabilities, text };
}

// ── Основной класс ─────────────────────────────────────────────────

class IMAPMonitorType extends MonitorType {
    name = "imap";

    /** @inheritdoc */
    async check(monitor, heartbeat, _server) {
        const security = monitor.smtpSecurity || "starttls";
        const startTime = dayjs().valueOf();

        if (security === "secure") {
            await this.checkImaps(monitor, heartbeat, startTime);
        } else if (security === "starttls") {
            await this.checkStartTls(monitor, heartbeat, startTime);
        } else {
            await this.checkPlain(monitor, heartbeat, startTime);
        }
    }

    // ── Режимы ─────────────────────────────────────────────────

    /**
     * Plain IMAP (без TLS, порт 143).
     * Диалог: баннер → LOGOUT.
     */
    async checkPlain(monitor, heartbeat, startTime) {
        const timeoutMs = (monitor.timeout || TIMEOUT) * 1000;
        const socket = await this.connectSocket(monitor, timeoutMs, 143);

        try {
            const bannerResp = await imapCommand(socket, null, timeoutMs);
            const banner = parseBanner(bannerResp.untagged[0] || bannerResp.raw);
            this.validateBanner(banner);

            await imapCommand(socket, "LOGOUT", timeoutMs);

            const parts = ["IMAP OK"];
            if (banner.text) parts.push(banner.text);
            if (banner.capabilities.length) {
                parts.push(banner.capabilities.slice(0, 5).join(", "));
            }

            heartbeat.status = UP;
            heartbeat.ping = dayjs().valueOf() - startTime;
            heartbeat.msg = parts.join(" | ");
        } finally {
            if (!socket.destroyed) socket.end();
        }
    }

    /**
     * IMAPS (TLS сразу, порт 993).
     * Диалог: TLS↑ → баннер → LOGOUT.
     */
    async checkImaps(monitor, heartbeat, startTime) {
        const timeoutMs = (monitor.timeout || TIMEOUT) * 1000;
        const rawSocket = await this.connectSocket(monitor, timeoutMs, 993);

        let tlsSocket = null;

        try {
            const tlsStart = dayjs().valueOf();

            tlsSocket = tls.connect({
                socket: rawSocket,
                servername: monitor.hostname,
                rejectUnauthorized: !monitor.getIgnoreTls?.(),
            });
            tlsSocket.setNoDelay(true);

            // Пробуем прочитать баннер (RFC 9051 §6.2.1) с коротким таймаутом
            const bannerTimeoutMs = Math.min(timeoutMs, 2000);
            const bannerPromise = imapCommand(tlsSocket, null, bannerTimeoutMs);

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("TLS handshake timed out")), timeoutMs);
                tlsSocket.once("secureConnect", () => { clearTimeout(timer); tlsSocket.resume(); resolve(); });
                tlsSocket.once("error", (err) => { clearTimeout(timer); reject(new Error(`TLS handshake failed: ${err.message}`)); });
            });

            const tlsTime = dayjs().valueOf() - tlsStart;

            const imapStart = dayjs().valueOf();
            let banner = null;
            try {
                const bannerResp = await bannerPromise;
                banner = parseBanner(bannerResp.untagged[0] || bannerResp.raw);
                this.validateBanner(banner);
            } catch (e) {
                // Нет баннера — fallback: CAPABILITY
                const capResp = await imapCommand(tlsSocket, "CAPABILITY", timeoutMs);
                if (capResp.status !== "OK") {
                    throw new Error(`CAPABILITY failed: ${capResp.status}`);
                }
            }

            await imapCommand(tlsSocket, "LOGOUT", timeoutMs);
            const imapTime = dayjs().valueOf() - imapStart;

            await this._buildTlsResult(
                monitor, heartbeat, startTime,
                tlsSocket, banner,
                `${tlsTime}+${imapTime}ms`,
            );
        } finally {
            if (tlsSocket && !tlsSocket.destroyed) {
                tlsSocket.end();
            } else if (!rawSocket.destroyed) {
                rawSocket.end();
            }
        }
    }

    /**
     * STARTTLS (порт 143).
     * Диалог: баннер → STARTTLS → TLS↑ → баннер → LOGOUT.
     */
    async checkStartTls(monitor, heartbeat, startTime) {
        const timeoutMs = (monitor.timeout || TIMEOUT) * 1000;
        const bannerTimeoutMs = Math.min(timeoutMs, 2000);
        const rawSocket = await this.connectSocket(monitor, timeoutMs, 143);

        let tlsSocket = null;

        try {
            // 1. Баннер с capabilities
            const bannerResp = await imapCommand(rawSocket, null, timeoutMs);
            const preBanner = parseBanner(bannerResp.untagged[0] || bannerResp.raw);
            this.validateBanner(preBanner);

            if (!preBanner.capabilities.includes("STARTTLS")) {
                throw new Error("Server does not support STARTTLS");
            }

            // 2. STARTTLS
            const starttlsResp = await imapCommand(rawSocket, "STARTTLS", timeoutMs);
            if (starttlsResp.status !== "OK") {
                throw new Error(
                    `STARTTLS failed: ${starttlsResp.status} ${starttlsResp.raw}`,
                );
            }

            // 3. TLS-апгрейд — новая IMAP-сессия
            const tlsStart = dayjs().valueOf();

            tlsSocket = tls.connect({
                socket: rawSocket,
                servername: monitor.hostname,
                rejectUnauthorized: !monitor.getIgnoreTls?.(),
            });
            tlsSocket.setNoDelay(true);

            // Пробуем прочитать пост-TLS баннер (RFC 9051 §6.2.1)
            const bannerPromise = imapCommand(tlsSocket, null, bannerTimeoutMs);

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("TLS handshake timed out")), timeoutMs);
                tlsSocket.once("secureConnect", () => { clearTimeout(timer); tlsSocket.resume(); resolve(); });
                tlsSocket.once("error", (err) => { clearTimeout(timer); reject(new Error(`TLS handshake failed: ${err.message}`)); });
            });

            const tlsTime = dayjs().valueOf() - tlsStart;

            // 4. Читаем пост-TLS баннер; fallback: CAPABILITY + LOGOUT
            const imapStart = dayjs().valueOf();
            let postBanner = null;
            try {
                const postBannerResp = await bannerPromise;
                postBanner = parseBanner(postBannerResp.untagged[0] || postBannerResp.raw);
                this.validateBanner(postBanner);
            } catch (e) {
                // Нет баннера — fallback: CAPABILITY
                const capResp = await imapCommand(tlsSocket, "CAPABILITY", timeoutMs);
                if (capResp.status !== "OK") {
                    throw new Error(`CAPABILITY failed: ${capResp.status}`);
                }
            }

            // LOGOUT
            await imapCommand(tlsSocket, "LOGOUT", timeoutMs);
            const imapTime = dayjs().valueOf() - imapStart;

            await this._buildTlsResult(
                monitor, heartbeat, startTime,
                tlsSocket, postBanner || preBanner,
                `${tlsTime}+${imapTime}ms`,
            );
        } finally {
            if (tlsSocket && !tlsSocket.destroyed) {
                tlsSocket.end();
            } else if (!rawSocket.destroyed) {
                rawSocket.end();
            }
        }
    }

    // ── Общие хелперы ──────────────────────────────────────────

    /** Валидирует баннер: OK и PREAUTH — норма, остальное — ошибка. */
    validateBanner(banner) {
        if (banner.status !== "OK" && banner.status !== "PREAUTH") {
            throw new Error(
                `Unexpected banner status: ${banner.status} — ${banner.text}`,
            );
        }
    }

    /** TCP-сокет + ожидание подключения. */
    connectSocket(monitor, timeoutMs, defaultPort) {
        const socket = net.connect(monitor.port || defaultPort, monitor.hostname);
        socket.setNoDelay(true);
        return this._waitForConnect(socket, timeoutMs);
    }

    _waitForConnect(socket, timeoutMs) {
        return new Promise((resolve, reject) => {
            let resolved = false;

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error("Connection timed out"));
                }
            }, timeoutMs);

            socket.once("connect", () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve(socket);
                }
            });

            socket.once("error", (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    reject(err);
                }
            });
        });
    }

    /**
     * Формирует heartbeat для TLS-режимов.
     * Сертификат, TLS-версия/шифр, софт сервера, тайминг.
     */
    async _buildTlsResult(monitor, heartbeat, startTime, tlsSocket, banner, timing) {
        const certInfo = await this._checkAndHandleCert(monitor, tlsSocket);
        const tlsSummary = this._getTlsSummary(tlsSocket);

        const parts = ["IMAP OK"];
        if (banner && banner.text) parts.push(banner.text);
        if (tlsSummary) parts.push(tlsSummary);
        if (certInfo) {
            parts.push(
                `Cert: ${certInfo.cn} (${certInfo.issuer}, ${certInfo.validTo}, ${certInfo.daysRemaining}d)`,
            );
        }
        if (timing) parts.push(`(${timing})`);

        heartbeat.status = UP;
        heartbeat.ping = dayjs().valueOf() - startTime;
        heartbeat.msg = parts.join(" | ");
    }

    /** Проверяет сертификат, сохраняет TLS-инфо, возвращает сводку. */
    async _checkAndHandleCert(monitor, tlsSocket) {
        const tlsInfo = checkCertificate(tlsSocket);
        if (tlsInfo) {
            await monitor.handleTlsInfo?.(tlsInfo);
            if (!tlsInfo.valid && !monitor.getIgnoreTls?.()) {
                throw new Error(
                    `TLS certificate is not valid: ${tlsInfo.certInfo?.subject?.CN || "unknown"}`,
                );
            }
        }

        const cert = tlsSocket.getPeerCertificate(false);
        if (!cert || !cert.subject) return null;

        const cn = cert.subject.CN;
        const issuerCn = cert.issuer?.CN;

        return {
            cn: Array.isArray(cn) ? cn[0] : (cn || "unknown"),
            issuer: Array.isArray(issuerCn) ? issuerCn[0] : (issuerCn || "unknown"),
            validTo: cert.valid_to ? dayjs(cert.valid_to).format("YYYY-MM-DD") : "?",
            daysRemaining: cert.valid_to
                ? dayjs.utc(cert.valid_to).diff(dayjs.utc(), "day")
                : "?",
        };
    }

    /** TLS-версия и шифр одной строкой. Пример: "TLSv1.3 TLS_AES_256_GCM_SHA384" */
    _getTlsSummary(tlsSocket) {
        const cipher = tlsSocket.getCipher();
        if (!cipher) return null;
        return `${cipher.version} ${cipher.standardName || cipher.name}`;
    }
}

module.exports = {
    IMAPMonitorType,
};
