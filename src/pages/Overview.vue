<template>
    <div class="overview-standalone">
        <div class="overview-container">
            <header class="overview-header">
                <h1 class="overview-title">Статус сервисов</h1>
                <div v-if="lastUpdated" class="overview-updated">
                    Обновлено: {{ lastUpdated }}
                </div>
            </header>

            <div class="overall-banner" :class="'banner-' + overallStatus">
                <div class="banner-content">
                    <span class="banner-icon">{{ statusIcon }}</span>
                    <div>
                        <div class="banner-text">{{ statusText }}</div>
                        <div v-if="downServices.length > 0" class="banner-detail">
                            {{ downServicesText }}
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="dataReady">
                <div v-for="group in groups" :key="group.id" class="group-card" @click="openGroupModal(group)">
                    <div class="group-card-header">
                        <div class="group-card-title">
                            <span class="status-dot" :class="groupStatusDotClass(group.id)" />
                            <span class="group-name">{{ group.name }}</span>
                        </div>
                        <span class="group-count">{{ groupChildrenCount(group.id) }} сервисов</span>
                    </div>
                    <div class="group-heartbeat-bar">
                        <div
                            v-for="(seg, idx) in groupHeartbeatSegments(group.id)"
                            :key="idx"
                            class="bar-segment"
                            :class="'seg-' + seg.status"
                            @mouseenter="showBarTooltip($event, seg)"
                            @mousemove="moveBarTooltip($event)"
                            @mouseleave="hideBarTooltip"
                        />
                    </div>
                    <div v-if="groupIncidentSummary(group.id)" class="group-incident-summary">
                        <span class="incident-summary-dot" /> {{ groupIncidentSummary(group.id) }}
                    </div>
                </div>

                <div v-if="ungrouped.length > 0" class="group-card">
                    <div class="group-card-header">
                        <div class="group-card-title">
                            <span class="group-name">Другие сервисы</span>
                        </div>
                        <span class="group-count">{{ ungrouped.length }} сервисов</span>
                    </div>
                    <div class="ungrouped-list">
                        <div
                            v-for="monitor in ungrouped"
                            :key="monitor.id"
                            class="ungrouped-item"
                        >
                            <span class="status-dot small-dot" :class="statusDotClass(monitor.id)" />
                            <span class="ungrouped-name">{{ monitor.name }}</span>
                            <div class="ungrouped-bar-wrapper">
                                <div class="heartbeat-bar-mini">
                                    <div
                                        v-for="(seg, idx) in heartbeatSegments(monitor.id)"
                                        :key="idx"
                                        class="bar-segment"
                                        :class="'seg-' + seg.status"
                                        @mouseenter="showBarTooltip($event, seg)"
                                        @mousemove="moveBarTooltip($event)"
                                        @mouseleave="hideBarTooltip"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="loading-state">
                Загрузка...
            </div>

            <footer class="overview-footer">
                <span>Uptime Kumar</span>
            </footer>
        </div>

        <GroupServicesModal
            ref="groupModal"
            :group-name="selectedGroupName"
            :children="selectedGroupChildren"
            :heartbeat-data="timelineData"
            :incidents="allIncidents"
            :heartbeat-map="heartbeatMap"
            :total-points="totalPoints"
            @open-incident="openIncidentDetail"
        />

        <div ref="incidentPopup" class="incident-popup" :class="{ visible: popup.visible }" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
            <div class="popup-header">
                <span class="popup-badge" :class="'popup-' + popup.stage">{{ popup.stageLabel }}</span>
                <span class="popup-date">{{ popup.date }}</span>
            </div>
            <h6 class="popup-title">{{ popup.title }}</h6>
            <div v-if="popup.monitorName" class="popup-service">Сервис: {{ popup.monitorName }}</div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-if="popup.content" class="popup-body" v-html="popup.renderedContent" />
            <div v-if="popup.timeline && popup.timeline.length > 0" class="popup-timeline">
                <div class="popup-timeline-title">Хронология</div>
                <div v-for="entry in popup.timeline" :key="entry.id" class="popup-timeline-item">
                    <span class="popup-tl-badge" :class="'popup-' + entry.stage">{{ popupStageLabel(entry.stage) }}</span>
                    <span class="popup-tl-date">{{ formatDate(entry.created_date) }}</span>
                </div>
            </div>
            <div v-if="popup.postmortem" class="popup-postmortem">
                <div class="popup-postmortem-title">Post-mortem</div>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="popup-body" v-html="popup.renderedPostMortem" />
            </div>
        </div>

        <div
            v-if="barTooltip.visible"
            class="bar-tooltip"
            :style="{ left: barTooltip.x + 'px', top: barTooltip.y + 'px' }"
            @mouseenter="onBarTooltipEnter"
            @mouseleave="onBarTooltipLeave"
        >
            <div class="bar-tooltip-time">{{ barTooltip.timeText }}</div>
            <div
                v-for="(entry, idx) in barTooltip.downtimeEntries"
                :key="'dt-' + idx"
                class="bar-tooltip-downtime"
            >
                <span style="white-space: pre-line">{{ entry.text }}</span>
            </div>
            <div
                v-if="barTooltip.downtimeText && barTooltip.downtimeEntries.length === 0"
                class="bar-tooltip-downtime"
            >
                <span style="white-space: pre-line">{{ barTooltip.downtimeText }}</span>
            </div>
            <div
                v-for="item in barTooltip.incidents"
                :key="item.incident.id"
                class="bar-tooltip-incident"
                @click="onBarTooltipIncidentClick(item.incident)"
            >
                {{ item.incident.title }}
            </div>
        </div>
    </div>
</template>

<script>
import { marked } from "marked";
import DOMPurify from "dompurify";
import GroupServicesModal from "../components/GroupServicesModal.vue";

let _UP = 1;
let _DOWN = 0;
let _PENDING = 2;
let _MAINTENANCE = 3;

export default {
    components: {
        GroupServicesModal,
    },

    data() {
        return {
            groups: [],
            children: [],
            ungrouped: [],
            heartbeatMap: {},
            overallStatus: "unknown",
            allIncidents: [],
            lastUpdated: null,
            dataReady: false,
            timer: null,
            timelineData: {},
            totalPoints: 90,
            selectedGroupName: "",
            selectedGroupChildren: [],
            popup: {
                visible: false,
                x: 0,
                y: 0,
                stage: "",
                stageLabel: "",
                title: "",
                date: "",
                monitorName: "",
                content: "",
                renderedContent: "",
                postmortem: "",
                renderedPostMortem: "",
                timeline: null,
            },
            barTooltip: {
                visible: false,
                x: 0,
                y: 0,
                timeText: "",
                incidents: [],
                downtimeText: "",
                downtimeEntries: [],
            },
            barTooltipHideTimeout: null,
        };
    },

    computed: {
        statusIcon() {
            if (this.overallStatus === "up") {
                return "\u2705";
            }
            if (this.overallStatus === "down") {
                return "\u274C";
            }
            if (this.overallStatus === "pending") {
                return "\u26A0\uFE0F";
            }
            if (this.overallStatus === "maintenance") {
                return "\uD83D\uDD27";
            }
            return "\u2753";
        },

        statusText() {
            if (this.overallStatus === "up") {
                return "Все системы работают нормально";
            }
            if (this.overallStatus === "down") {
                return "Часть систем недоступна";
            }
            if (this.overallStatus === "pending") {
                return "Проверка доступности...";
            }
            if (this.overallStatus === "maintenance") {
                return "Ведутся технические работы";
            }
            return "Статус неизвестен";
        },

        downServices() {
            const allMonitors = [...this.children, ...this.ungrouped];
            return allMonitors.filter((m) => {
                const hb = this.heartbeatMap[m.id];
                return hb && hb.status === _DOWN;
            });
        },

        downServicesText() {
            return this.downServices.map((m) => m.name).join(", ");
        },

        incidentsByMonitor() {
            const map = {};
            for (const inc of this.allIncidents) {
                if (!map[inc.monitorId]) {
                    map[inc.monitorId] = [];
                }
                map[inc.monitorId].push(inc);
            }
            return map;
        },
    },

    mounted() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), 10000);
    },

    beforeUnmount() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    },

    methods: {
        async fetchData() {
            try {
                const [dataRes, hbRes] = await Promise.all([
                    fetch("/api/overview/data"),
                    fetch("/api/overview/heartbeats?days=90&points=90"),
                ]);
                const dataJson = await dataRes.json();
                const hbJson = await hbRes.json();

                if (dataJson.ok) {
                    this.groups = dataJson.groups || [];
                    this.children = dataJson.children || [];
                    this.ungrouped = dataJson.ungrouped || [];
                    this.heartbeatMap = dataJson.heartbeatMap || {};
                    this.overallStatus = dataJson.overallStatus || "unknown";
                    this.allIncidents = dataJson.incidents || [];
                    this.lastUpdated = new Date().toLocaleTimeString("ru-RU");
                    this.dataReady = true;
                }

                if (hbJson.ok) {
                    this.timelineData = hbJson.heartbeatData || {};
                    this.totalPoints = hbJson.points || 90;
                }
            } catch (e) {
                console.error("Failed to fetch overview data:", e);
            }
        },

        groupChildrenCount(groupId) {
            return this.children.filter((c) => c.parent === groupId).length;
        },

        groupChildrenArr(groupId) {
            return this.children.filter((c) => c.parent === groupId);
        },

        statusDotClass(monitorId) {
            const hb = this.heartbeatMap[monitorId];
            const s = hb ? hb.status : -1;
            if (s === _UP) {
                return "dot-up";
            }
            if (s === _DOWN) {
                return "dot-down";
            }
            if (s === _PENDING) {
                return "dot-pending";
            }
            if (s === _MAINTENANCE) {
                return "dot-maintenance";
            }
            return "dot-unknown";
        },

        groupStatusDotClass(groupId) {
            const children = this.groupChildrenArr(groupId);
            if (children.length === 0) {
                return "dot-unknown";
            }
            const hasDown = children.some((c) => this.heartbeatMap[c.id]?.status === _DOWN);
            const hasPending = children.some((c) => this.heartbeatMap[c.id]?.status === _PENDING);
            const hasMaintenance = children.some((c) => this.heartbeatMap[c.id]?.status === _MAINTENANCE);
            const allUp = children.every((c) => this.heartbeatMap[c.id]?.status === _UP);
            if (hasDown) {
                return "dot-down";
            }
            if (hasPending) {
                return "dot-pending";
            }
            if (hasMaintenance) {
                return "dot-maintenance";
            }
            if (allUp) {
                return "dot-up";
            }
            return "dot-unknown";
        },

        groupHeartbeatSegments(groupId) {
            const children = this.groupChildrenArr(groupId);
            const segs = new Array(this.totalPoints).fill(null).map(() => ({
                status: "unknown",
                title: "",
                start: null,
                end: null,
                monitorName: "",
                incidents: [],
                downtimeEntries: [],
            }));

            if (children.length === 0) {
                return segs;
            }

            for (let i = 0; i < this.totalPoints; i++) {
                let worstStatus = _UP;
                let hasData = false;
                let bucketStart = null;
                let bucketEnd = null;

                for (const child of children) {
                    const data = this.timelineData[child.id];
                    if (!data) {
                        continue;
                    }
                    const entry = data.find((e) => e.bucketIdx === i);
                    if (!entry) {
                        continue;
                    }
                    hasData = true;
                    if (bucketStart === null || entry.start < bucketStart) {
                        bucketStart = entry.start;
                    }
                    if (bucketEnd === null || entry.end > bucketEnd) {
                        bucketEnd = entry.end;
                    }
                    if (entry.status < worstStatus) {
                        worstStatus = entry.status;
                    }
                }

                if (!hasData) {
                    continue;
                }

                const infoArr = this.groupIncidentInfoForBucket(groupId, i);
                let segStatus = "unknown";
                let segTitle = "";
                let segMonitorName = "";

                if (worstStatus === _UP) {
                    segStatus = "up";
                } else if (worstStatus === _DOWN) {
                    segStatus = "down";
                    segTitle = infoArr.map((x) => x.title).join(", ");
                    segMonitorName = infoArr.map((x) => x.monitorName).join(", ");
                } else if (worstStatus === _PENDING) {
                    segStatus = "pending";
                } else if (worstStatus === _MAINTENANCE) {
                    segStatus = "maintenance";
                }

                // Collect downtime entries from children with requireIncidentReport=false
                const downtimeEntries = [];
                for (const child of children) {
                    const data = this.timelineData[child.id];
                    const entry = data?.find((e) => e.bucketIdx === i);
                    if (entry && entry.status === _DOWN && child && !child.requireIncidentReport && entry.downTime) {
                        const d = new Date(entry.downTime);
                        downtimeEntries.push({
                            text: child.name + "\n" +
                                  d.toLocaleDateString("ru-RU", { month: "short", day: "numeric" }) + "\n" +
                                  d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + " " +
                                  (entry.downMsg || "неизвестная ошибка"),
                        });
                    }
                }

                segs[i] = {
                    status: segStatus,
                    title: segTitle,
                    start: bucketStart,
                    end: bucketEnd,
                    monitorName: segMonitorName,
                    incidents: infoArr,
                    downtimeEntries,
                };
            }

            return segs;
        },

        groupIncidentInfoForBucket(groupId, bucketIdx) {
            const children = this.groupChildrenArr(groupId);
            const result = [];
            for (const child of children) {
                const incs = this.incidentsByMonitor[child.id];
                if (!incs) {
                    continue;
                }
                const data = this.timelineData[child.id];
                if (!data) {
                    continue;
                }
                const entry = data.find((e) => e.bucketIdx === bucketIdx);
                if (!entry) {
                    continue;
                }
                for (const inc of incs) {
                    const created = new Date(inc.createdDate).getTime();
                    const resolved = inc.resolvedDate ? new Date(inc.resolvedDate).getTime() : Infinity;
                    const segStart = new Date(entry.start).getTime();
                    const segEnd = new Date(entry.end).getTime();
                    if (created <= segEnd && resolved >= segStart) {
                        result.push({
                            title: inc.title,
                            monitorName: child.name,
                            incident: inc,
                        });
                    }
                }
            }
            return result;
        },

        groupIncidentForBucket(groupId, bucketIdx) {
            const infoArr = this.groupIncidentInfoForBucket(groupId, bucketIdx);
            return infoArr.map((x) => x.title).join(", ");
        },

        groupIncidentSummary(groupId) {
            const children = this.groupChildrenArr(groupId);
            const activeIncidents = [];
            for (const child of children) {
                const incs = this.incidentsByMonitor[child.id];
                if (!incs) {
                    continue;
                }
                for (const inc of incs) {
                    if (inc.active) {
                        activeIncidents.push({ service: child.name, incident: inc });
                    }
                }
            }
            if (activeIncidents.length === 0) {
                return "";
            }
            return activeIncidents.map((x) => x.service + ": " + x.incident.title).join("; ");
        },

        heartbeatSegments(monitorId) {
            const data = this.timelineData[monitorId] || [];
            const segs = new Array(this.totalPoints).fill(null).map(() => ({
                status: "unknown",
                title: "",
                start: null,
                end: null,
                incidents: [],
                downTime: null,
                downMsg: "",
                monitorId: null,
            }));

            for (const entry of data) {
                const idx = entry.bucketIdx;
                if (idx >= 0 && idx < this.totalPoints) {
                    const incidentList = [];
                    if (entry.status === _DOWN) {
                        const incs = this.incidentsByMonitor[monitorId] || [];
                        for (const inc of incs) {
                            const created = new Date(inc.createdDate).getTime();
                            const resolved = inc.resolvedDate ? new Date(inc.resolvedDate).getTime() : Infinity;
                            const segStart = new Date(entry.start).getTime();
                            const segEnd = new Date(entry.end).getTime();
                            if (created <= segEnd && resolved >= segStart) {
                                incidentList.push({ title: inc.title, monitorName: "", incident: inc });
                            }
                        }
                    }
                    const joinedTitle = incidentList.map((x) => x.title).join(", ");
                    const s = entry.status;
                    let segStatus = "unknown";
                    if (s === _UP) {
                        segStatus = "up";
                    } else if (s === _DOWN) {
                        segStatus = "down";
                    } else if (s === _PENDING) {
                        segStatus = "pending";
                    } else if (s === _MAINTENANCE) {
                        segStatus = "maintenance";
                    }
                    segs[idx] = {
                        status: segStatus,
                        title: joinedTitle,
                        start: entry.start,
                        end: entry.end,
                        incidents: incidentList,
                        downTime: entry.downTime || null,
                        downMsg: entry.downMsg || "",
                        monitorId,
                    };
                }
            }
            return segs;
        },

        openGroupModal(group) {
            this.selectedGroupName = group.name;
            this.selectedGroupChildren = this.groupChildrenArr(group.id);
            this.$refs.groupModal.show();
        },

        formatTooltipTime(start, end) {
            if (!start || !end) {
                return "";
            }
            const s = new Date(start);
            const e = new Date(end);
            const opts = { month: "short", day: "numeric" };
            return s.toLocaleDateString("ru-RU", opts) + " — " + e.toLocaleDateString("ru-RU", opts);
        },

        showBarTooltip(event, seg) {
            if (this.barTooltipHideTimeout) {
                clearTimeout(this.barTooltipHideTimeout);
                this.barTooltipHideTimeout = null;
            }

            const timeText = seg.start ? this.formatTooltipTime(seg.start, seg.end) : "Нет данных";

            // Build downtime text for monitors with requireIncidentReport=false
            let downtimeText = "";
            let downtimeEntries = [];

            if (seg.downtimeEntries && seg.downtimeEntries.length > 0) {
                // Group bar: use pre-computed downtimeEntries
                downtimeEntries = seg.downtimeEntries;
                downtimeText = downtimeEntries.map((e) => e.text).join("\n");
            } else if (seg.monitorId && seg.downTime) {
                // Ungrouped bar: look up monitor and check requireIncidentReport
                const allMonitors = [...this.children, ...this.ungrouped];
                const monitor = allMonitors.find((m) => m.id === seg.monitorId);
                if (monitor && !monitor.requireIncidentReport) {
                    const d = new Date(seg.downTime);
                    downtimeText = d.toLocaleDateString("ru-RU", { month: "short", day: "numeric" }) + "\n" +
                                   d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + " " +
                                   (seg.downMsg || "неизвестная ошибка");
                }
            }

            this.barTooltip = {
                visible: true,
                x: event.clientX,
                y: event.clientY + 8,
                timeText,
                incidents: seg.incidents || [],
                downtimeText,
                downtimeEntries,
            };
        },

        moveBarTooltip(event) {
            this.barTooltip.x = event.clientX;
            this.barTooltip.y = event.clientY + 8;
        },

        hideBarTooltip() {
            this.barTooltipHideTimeout = setTimeout(() => {
                this.barTooltip.visible = false;
                this.barTooltipHideTimeout = null;
            }, 200);
        },

        onBarTooltipEnter() {
            if (this.barTooltipHideTimeout) {
                clearTimeout(this.barTooltipHideTimeout);
                this.barTooltipHideTimeout = null;
            }
        },

        onBarTooltipLeave() {
            this.barTooltip.visible = false;
            if (this.barTooltipHideTimeout) {
                clearTimeout(this.barTooltipHideTimeout);
                this.barTooltipHideTimeout = null;
            }
        },

        onBarTooltipIncidentClick(incident) {
            this.hideBarTooltip();
            this.openIncidentDetail(incident);
        },

        openIncidentDetail(incident) {
            this.popup.visible = true;
            this.popup.stage = incident.stage;
            this.popup.stageLabel = this.popupStageLabel(incident.stage);
            this.popup.title = incident.title;
            this.popup.date = this.formatDate(incident.createdDate);
            this.popup.monitorName = this.monitorName(incident.monitorId);
            this.popup.content = incident.content;
            this.popup.renderedContent = this.renderMarkdown(incident.content);
            this.popup.postmortem = incident.postmortem;
            this.popup.renderedPostMortem = incident.postmortem ? this.renderMarkdown(incident.postmortem) : "";
            this.popup.timeline = incident.timeline || [];

            const x = window.innerWidth / 2 - 240;
            const y = Math.max(80, window.scrollY + 100);
            this.popup.x = x;
            this.popup.y = y;

            setTimeout(() => {
                const handler = (e) => {
                    if (!this.$refs.incidentPopup || !this.$refs.incidentPopup.contains(e.target)) {
                        this.popup.visible = false;
                        document.removeEventListener("click", handler);
                    }
                };
                document.addEventListener("click", handler);
            }, 100);
        },

        monitorName(monitorId) {
            const allMonitors = [...this.children, ...this.ungrouped, ...this.groups];
            const m = allMonitors.find((x) => x.id === monitorId);
            return m ? m.name : "#" + monitorId;
        },

        formatDate(dateStr) {
            if (!dateStr) {
                return "";
            }
            try {
                return new Date(dateStr).toLocaleString("ru-RU");
            } catch {
                return dateStr;
            }
        },

        popupStageLabel(stage) {
            if (stage === "recorded") {
                return "Зафиксировано";
            }
            if (stage === "in_progress") {
                return "В работе";
            }
            if (stage === "resolved") {
                return "Устранено";
            }
            return stage;
        },

        renderMarkdown(content) {
            if (!content) {
                return "";
            }
            return DOMPurify.sanitize(marked.parse(content));
        },
    },
};
</script>

<style scoped>
.overview-standalone {
    min-height: 100vh;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.overview-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 20px 48px;
}

.overview-header {
    text-align: center;
    margin-bottom: 24px;
}

.overview-title {
    font-size: 24px;
    font-weight: 600;
    color: #f0f0f0;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
}

.overview-updated {
    font-size: 12px;
    color: #666;
}

.overall-banner {
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 28px;
    text-align: center;
}

.banner-up {
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.25);
    color: #4ade80;
}

.banner-down {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #f87171;
}

.banner-pending {
    background: rgba(234, 179, 8, 0.12);
    border: 1px solid rgba(234, 179, 8, 0.25);
    color: #facc15;
}

.banner-maintenance {
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.25);
    color: #60a5fa;
}

.banner-unknown {
    background: rgba(107, 114, 128, 0.12);
    border: 1px solid rgba(107, 114, 128, 0.25);
    color: #9ca3af;
}

.banner-content {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    text-align: left;
}

.banner-text {
    font-size: 16px;
    font-weight: 500;
}

.banner-detail {
    font-size: 13px;
    margin-top: 4px;
    opacity: 0.85;
}

.banner-icon {
    margin-right: 8px;
}

/* Group Cards */
.group-card {
    background: #141414;
    border: 1px solid #222;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 16px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}

.group-card:hover {
    background: rgba(255, 255, 255, 0.03);
    border-color: #333;
}

.group-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.group-card-title {
    display: flex;
    align-items: center;
    gap: 10px;
}

.group-name {
    font-size: 15px;
    font-weight: 600;
    color: #e5e5e5;
}

.group-count {
    font-size: 12px;
    color: #666;
}

.group-heartbeat-bar {
    display: flex;
    gap: 2px;
    height: 28px;
    width: 100%;
}

.group-incident-summary {
    margin-top: 10px;
    font-size: 12px;
    color: #f87171;
    display: flex;
    align-items: center;
    gap: 6px;
}

.incident-summary-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
}

/* Segment shared */
.bar-segment {
    flex: 1;
    min-width: 3px;
    border-radius: 2px;
    transition: opacity 0.15s, transform 0.1s;
    cursor: pointer;
}

.bar-segment.seg-down:hover {
    opacity: 0.8;
    transform: scaleY(1.3);
}

.seg-up { background: #22c55e; }
.seg-down { background: #ef4444; }
.seg-pending { background: #eab308; }
.seg-maintenance { background: #3b82f6; }
.seg-unknown { background: #222; }

/* Status dots */
.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
}

.small-dot {
    width: 7px;
    height: 7px;
}

.dot-up {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.dot-down {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
}

.dot-pending {
    background: #eab308;
    box-shadow: 0 0 6px rgba(234, 179, 8, 0.4);
}

.dot-maintenance {
    background: #3b82f6;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
}

.dot-unknown {
    background: #6b7280;
}

/* Ungrouped section */
.ungrouped-list {
    border-top: 1px solid #1a1a1a;
    padding-top: 8px;
}

.ungrouped-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
}

.ungrouped-name {
    font-size: 13px;
    color: #999;
    flex-shrink: 0;
    min-width: 140px;
}

.ungrouped-bar-wrapper {
    flex: 1;
}

.heartbeat-bar-mini {
    display: flex;
    gap: 1px;
    height: 16px;
    width: 100%;
}

.heartbeat-bar-mini .bar-segment {
    min-width: 2px;
}

.loading-state {
    text-align: center;
    padding: 60px 0;
    color: #666;
    font-size: 14px;
}

.overview-footer {
    text-align: center;
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #222;
    color: #444;
    font-size: 12px;
}

/* Incident Popup */
.incident-popup {
    display: none;
    position: fixed;
    z-index: 99999;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    width: 480px;
    max-height: 80vh;
    overflow-y: auto;
}

.incident-popup.visible {
    display: block;
}

.popup-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.popup-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
}

.popup-recorded { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.popup-in_progress { background: rgba(234, 179, 8, 0.15); color: #facc15; }
.popup-resolved { background: rgba(34, 197, 94, 0.15); color: #4ade80; }

.popup-date {
    font-size: 12px;
    color: #666;
}

.popup-title {
    font-size: 16px;
    font-weight: 600;
    color: #f0f0f0;
    margin: 0 0 4px;
}

.popup-service {
    font-size: 12px;
    color: #666;
    margin-bottom: 10px;
}

.popup-body {
    font-size: 13px;
    color: #999;
    line-height: 1.5;
    margin-bottom: 12px;
}

.popup-body :deep(p) { margin: 0 0 4px; }
.popup-body :deep(code) { background: #111; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.popup-body :deep(strong) { color: #d4d4d4; }

.popup-timeline-title,
.popup-postmortem-title {
    font-size: 13px;
    font-weight: 600;
    color: #aaa;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.popup-timeline {
    margin-bottom: 12px;
    padding-top: 10px;
    border-top: 1px solid #222;
}

.popup-timeline-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 12px;
}

.popup-tl-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
}

.popup-tl-date {
    color: #666;
    font-size: 11px;
}

.popup-postmortem {
    padding-top: 10px;
    border-top: 1px solid #222;
}

.bar-tooltip {
    position: fixed;
    z-index: 99999;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 8px 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    min-width: 160px;
    text-align: center;
    transform: translate(-50%, 0);
    pointer-events: auto;
}

.bar-tooltip-time {
    font-size: 12px;
    color: #999;
    pointer-events: none;
}

.bar-tooltip-incident {
    margin-top: 6px;
    font-size: 12px;
    color: #f87171;
    cursor: pointer;
    pointer-events: auto;
    text-decoration: underline;
    text-underline-offset: 2px;
}

.bar-tooltip-incident:hover {
    color: #fca5a5;
}

.bar-tooltip-downtime {
    margin-top: 6px;
    font-size: 12px;
    color: #999;
    pointer-events: auto;
    text-align: left;
    line-height: 1.3;
}
</style>
