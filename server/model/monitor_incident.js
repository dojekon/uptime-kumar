const { BeanModel } = require("redbean-node/dist/bean-model");
const { R } = require("redbean-node");
const dayjs = require("dayjs");

class MonitorIncident extends BeanModel {
    /**
     * Resolve the incident and mark it as inactive
     * @param {number} monitorStatus Current monitor status (UP=1)
     * @returns {Promise<void>}
     */
    async resolve(monitorStatus) {
        if (!this.active) {
            throw new Error("Incident is already resolved");
        }
        if (monitorStatus !== 1) {
            throw new Error("Cannot resolve incident: service is not available");
        }
        this.stage = "resolved";
        this.active = false;
        this.resolved_date = R.isoDateTime(dayjs.utc());
        this.last_updated_date = R.isoDateTime(dayjs.utc());
        await R.store(this);
        await this.recordTimelineEntry("resolved");
    }

    /**
     * Update incident stage
     * @param {string} stage New stage value
     * @returns {Promise<void>}
     */
    async setStage(stage) {
        if (!this.active) {
            throw new Error("Cannot update stage of a resolved incident");
        }
        this.stage = stage;
        this.last_updated_date = R.isoDateTime(dayjs.utc());
        await R.store(this);
        await this.recordTimelineEntry(stage);
    }

    /**
     * Set post-mortem report (only after resolution)
     * @param {string} content Post-mortem text
     * @returns {Promise<void>}
     */
    async setPostMortem(content) {
        if (this.active) {
            throw new Error("Cannot write post-mortem for an active incident");
        }
        this.postmortem = content;
        this.last_updated_date = R.isoDateTime(dayjs.utc());
        await R.store(this);
    }

    /**
     * Record a status timeline entry
     * @param {string} stage
     * @returns {Promise<void>}
     */
    async recordTimelineEntry(stage) {
        const entry = R.dispense("incident_status_timeline");
        entry.incident_id = this.id;
        entry.stage = stage;
        entry.created_date = R.isoDateTime(dayjs.utc());
        await R.store(entry);
    }

    /**
     * Get status timeline for this incident
     * @returns {Promise<Array>}
     */
    async getTimeline() {
        return await R.find("incident_status_timeline", " incident_id = ? ORDER BY created_date ASC ", [this.id]);
    }

    /**
     * Return an object ready to parse to JSON
     * @returns {object}
     */
    toJSON() {
        return {
            id: this.id,
            monitorId: this.monitor_id,
            title: this.title,
            content: this.content,
            postmortem: this.postmortem,
            stage: this.stage,
            active: !!this.active,
            createdDate: this.created_date,
            lastUpdatedDate: this.last_updated_date,
            resolvedDate: this.resolved_date,
        };
    }

    /**
     * Get active incidents for a monitor
     * @param {number} monitorId
     * @returns {Promise<Array>}
     */
    static async getActiveByMonitorId(monitorId) {
        return await R.find("monitor_incident", " monitor_id = ? AND active = 1 ORDER BY created_date DESC ", [
            monitorId,
        ]);
    }

    /**
     * Get all incidents for a monitor (including resolved)
     * @param {number} monitorId
     * @returns {Promise<Array>}
     */
    static async getAllByMonitorId(monitorId) {
        return await R.find("monitor_incident", " monitor_id = ? ORDER BY created_date DESC ", [monitorId]);
    }

    /**
     * Get all active incidents across all monitors
     * @returns {Promise<Array>}
     */
    static async getAllActive() {
        return await R.find("monitor_incident", " active = 1 ORDER BY created_date DESC ");
    }

    /**
     * Get all incidents across all monitors (including resolved)
     * @returns {Promise<Array>}
     */
    static async getAllIncidents() {
        return await R.find("monitor_incident", " 1 = 1 ORDER BY created_date DESC ");
    }
}

module.exports = MonitorIncident;
