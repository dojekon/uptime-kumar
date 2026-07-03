const { checkLogin } = require("../util-server");
const { R } = require("redbean-node");
const dayjs = require("dayjs");
const MonitorIncident = require("../model/monitor_incident");

/**
 * Handlers for monitor incident reports
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.monitorIncidentSocketHandler = (socket) => {
    socket.on("getMonitorIncidents", async (monitorId, callback) => {
        try {
            checkLogin(socket);
            const incidents = await MonitorIncident.getAllByMonitorId(monitorId);
            callback({
                ok: true,
                incidents: incidents.map((i) => i.toJSON()),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("getAllActiveMonitorIncidents", async (callback) => {
        try {
            checkLogin(socket);
            const incidents = await MonitorIncident.getAllActive();
            callback({
                ok: true,
                incidents: incidents.map((i) => i.toJSON()),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("getAllMonitorIncidents", async (callback) => {
        try {
            checkLogin(socket);
            const incidents = await MonitorIncident.getAllIncidents();
            callback({
                ok: true,
                incidents: incidents.map((i) => i.toJSON()),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("getIncidentDetail", async (incidentId, callback) => {
        try {
            checkLogin(socket);
            const incident = await R.load("monitor_incident", incidentId);
            if (!incident) {
                throw new Error("Incident not found");
            }
            const timeline = await incident.getTimeline();
            callback({
                ok: true,
                incident: incident.toJSON(),
                timeline: timeline.map((t) => ({
                    id: t.id,
                    stage: t.stage,
                    createdDate: t.created_date,
                })),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("createMonitorIncident", async (monitorId, incidentData, callback) => {
        try {
            checkLogin(socket);
            const incident = R.dispense("monitor_incident");
            incident.monitor_id = monitorId;
            incident.title = incidentData.title;
            incident.content = incidentData.content || "";
            incident.stage = incidentData.stage || "recorded";
            incident.active = true;
            incident.created_date = R.isoDateTime(dayjs.utc());
            incident.last_updated_date = R.isoDateTime(dayjs.utc());
            await R.store(incident);
            await incident.recordTimelineEntry(incident.stage);
            callback({
                ok: true,
                incident: incident,
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("updateMonitorIncident", async (incidentId, data, callback) => {
        try {
            checkLogin(socket);
            const incident = await R.load("monitor_incident", incidentId);
            if (!incident) {
                throw new Error("Incident not found");
            }
            if (data.title !== undefined) {
                incident.title = data.title;
            }
            if (data.content !== undefined) {
                incident.content = data.content;
            }
            if (data.stage !== undefined) {
                incident.stage = data.stage;
            }
            incident.last_updated_date = R.isoDateTime(dayjs.utc());
            await R.store(incident);
            callback({
                ok: true,
                incident: incident,
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("changeIncidentStage", async (incidentId, newStage, callback) => {
        try {
            checkLogin(socket);
            const incident = await R.load("monitor_incident", incidentId);
            if (!incident) {
                throw new Error("Incident not found");
            }
            await incident.setStage(newStage);
            const timeline = await incident.getTimeline();
            callback({
                ok: true,
                incident: incident.toJSON(),
                timeline: timeline.map((t) => ({
                    id: t.id,
                    stage: t.stage,
                    createdDate: t.created_date,
                })),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("resolveMonitorIncident", async (incidentId, monitorStatus, callback) => {
        try {
            checkLogin(socket);
            const incident = await R.load("monitor_incident", incidentId);
            if (!incident) {
                throw new Error("Incident not found");
            }
            await incident.resolve(monitorStatus);
            const timeline = await incident.getTimeline();
            callback({
                ok: true,
                incident: incident.toJSON(),
                timeline: timeline.map((t) => ({
                    id: t.id,
                    stage: t.stage,
                    createdDate: t.created_date,
                })),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("savePostMortem", async (incidentId, content, callback) => {
        try {
            checkLogin(socket);
            const incident = await R.load("monitor_incident", incidentId);
            if (!incident) {
                throw new Error("Incident not found");
            }
            await incident.setPostMortem(content);
            callback({
                ok: true,
                incident: incident.toJSON(),
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });

    socket.on("deleteMonitorIncident", async (incidentId, callback) => {
        try {
            checkLogin(socket);
            const incident = await R.load("monitor_incident", incidentId);
            if (!incident) {
                throw new Error("Incident not found");
            }
            await R.trash(incident);
            callback({
                ok: true,
            });
        } catch (error) {
            callback({
                ok: false,
                msg: error.message,
            });
        }
    });
};
