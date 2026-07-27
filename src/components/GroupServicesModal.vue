<template>
    <div ref="modal" class="modal fade" tabindex="-1" data-bs-theme="dark">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">{{ groupName }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" />
                </div>
                <div class="modal-body">
                    <div v-for="child in children" :key="child.id" class="service-row">
                        <div class="service-header">
                            <span class="status-dot" :class="statusDotClass(child.id)" />
                            <span class="service-name">{{ child.name }}</span>
                        </div>
                        <div class="service-bar-wrapper">
                            <div class="heartbeat-bar">
                                <div
                                    v-for="(seg, idx) in heartbeatSegments(child.id)"
                                    :key="idx"
                                    class="bar-segment"
                                    :class="'seg-' + seg.status"
                                    @mouseenter="showTooltip($event, seg, child.id)"
                                    @mousemove="moveTooltip($event)"
                                    @mouseleave="hideTooltip"
                                    @click="onSegmentClick(seg, child.id)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <Teleport to="body">
        <div
            v-if="tooltip.visible"
            class="heartbeat-tooltip"
            :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
            @mouseenter="onTooltipEnter"
            @mouseleave="onTooltipLeave"
        >
            <div class="tooltip-time">{{ tooltip.text }}</div>
            <div v-if="tooltip.downtimeText" class="tooltip-downtime" style="white-space: pre-line">{{ tooltip.downtimeText }}</div>
            <div v-if="tooltip.incident" class="tooltip-incident" @click="openIncident(tooltip.incident)">
                {{ tooltip.incident.title }}
            </div>
        </div>
    </Teleport>
</template>

<script>
import { Modal } from "bootstrap";

let _UP = 1;
let _DOWN = 0;
let _PENDING = 2;
let _MAINTENANCE = 3;

export default {
    props: {
        groupName: { type: String, default: "" },
        children: { type: Array, default: () => [] },
        heartbeatData: { type: Object, default: () => ({}) },
        incidents: { type: Array, default: () => [] },
        heartbeatMap: { type: Object, default: () => ({}) },
        totalPoints: { type: Number, default: 90 },
    },
    emits: ["open-incident"],
    data() {
        return {
            modal: null,
            tooltip: { visible: false, x: 0, y: 0, text: "", incident: null, downtimeText: "" },
            tooltipHideTimeout: null,
        };
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },
    methods: {
        show() {
            this.modal.show();
        },
        hide() {
            this.modal.hide();
        },

        heartbeatSegments(monitorId) {
            const data = this.heartbeatData[monitorId] || [];
            const segs = new Array(this.totalPoints).fill(null).map(() => ({ status: "unknown" }));

            for (const entry of data) {
                const idx = entry.bucketIdx;
                if (idx >= 0 && idx < this.totalPoints) {
                    const s = entry.status;
                    if (s === _UP) {
                        segs[idx] = { status: "up", start: entry.start, end: entry.end, downTime: entry.downTime, downMsg: entry.downMsg };
                    } else if (s === _DOWN) {
                        segs[idx] = { status: "down", start: entry.start, end: entry.end, downTime: entry.downTime, downMsg: entry.downMsg };
                    } else if (s === _PENDING) {
                        segs[idx] = { status: "pending", start: entry.start, end: entry.end, downTime: entry.downTime, downMsg: entry.downMsg };
                    } else if (s === _MAINTENANCE) {
                        segs[idx] = { status: "maintenance", start: entry.start, end: entry.end, downTime: entry.downTime, downMsg: entry.downMsg };
                    }
                }
            }
            return segs;
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

        findIncident(monitorId, segmentStart, segmentEnd) {
            return this.incidents.find((inc) => {
                if (inc.monitorId !== monitorId) {
                    return false;
                }
                const created = new Date(inc.createdDate).getTime();
                const resolved = inc.resolvedDate ? new Date(inc.resolvedDate).getTime() : Infinity;
                const segStart = new Date(segmentStart).getTime();
                const segEnd = new Date(segmentEnd).getTime();
                return created <= segEnd && resolved >= segStart;
            }) || null;
        },

        formatTimeRange(start, end) {
            const s = new Date(start);
            const e = new Date(end);
            const opts = { month: "short", day: "numeric" };
            return s.toLocaleDateString("ru-RU", opts) + " — " + e.toLocaleDateString("ru-RU", opts);
        },

        showTooltip(event, seg, monitorId) {
            if (this.tooltipHideTimeout) {
                clearTimeout(this.tooltipHideTimeout);
                this.tooltipHideTimeout = null;
            }

            const text = seg.start
                ? this.formatTimeRange(seg.start, seg.end)
                : "Нет данных";

            let incident = null;
            if (seg.status === "down" && seg.start) {
                incident = this.findIncident(monitorId, seg.start, seg.end);
            }

            let downtimeText = "";
            if (seg.status === "down" && seg.downTime) {
                const monitor = this.children.find(c => c.id === monitorId);
                if (monitor && !monitor.requireIncidentReport) {
                    const date = new Date(seg.downTime).toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
                    const time = new Date(seg.downTime).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
                    const msg = seg.downMsg || "неизвестная ошибка";
                    downtimeText = date + "\n" + time + " " + msg;
                }
            }

            this.tooltip = {
                visible: true,
                x: event.clientX,
                y: event.clientY + 8,
                text,
                incident,
                downtimeText,
            };
        },

        moveTooltip(event) {
            this.tooltip.x = event.clientX;
            this.tooltip.y = event.clientY + 8;
        },

        hideTooltip() {
            this.tooltipHideTimeout = setTimeout(() => {
                this.tooltip.visible = false;
                this.tooltip.incident = null;
                this.tooltip.downtimeText = "";
                this.tooltipHideTimeout = null;
            }, 200);
        },

        onTooltipEnter() {
            if (this.tooltipHideTimeout) {
                clearTimeout(this.tooltipHideTimeout);
                this.tooltipHideTimeout = null;
            }
        },

        onTooltipLeave() {
            this.tooltip.visible = false;
            this.tooltip.incident = null;
            this.tooltip.downtimeText = "";
            if (this.tooltipHideTimeout) {
                clearTimeout(this.tooltipHideTimeout);
                this.tooltipHideTimeout = null;
            }
        },

        onSegmentClick(seg, monitorId) {
            if (seg.status === "down" && seg.start) {
                const incident = this.findIncident(monitorId, seg.start, seg.end);
                if (incident) {
                    this.hideTooltip();
                    this.$emit("open-incident", incident);
                }
            }
        },

        openIncident(incident) {
            this.hideTooltip();
            this.$emit("open-incident", incident);
        },
    },
};
</script>

<style scoped>
.service-row {
    padding: 12px 0;
    border-bottom: 1px solid #222;
}

.service-row:last-child {
    border-bottom: none;
}

.service-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.dot-up { background: #22c55e; }
.dot-down { background: #ef4444; }
.dot-pending { background: #eab308; }
.dot-maintenance { background: #3b82f6; }
.dot-unknown { background: #6b7280; }

.service-name {
    font-size: 14px;
    color: #d4d4d4;
}

.service-bar-wrapper {
    width: 100%;
}

.heartbeat-bar {
    display: flex;
    gap: 2px;
    height: 24px;
    width: 100%;
}

.bar-segment {
    flex: 1;
    min-width: 4px;
    border-radius: 3px;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
}

.bar-segment:hover {
    opacity: 0.8;
    transform: scaleY(1.3);
}

.seg-up { background: #22c55e; }
.seg-down { background: #ef4444; }
.seg-pending { background: #eab308; }
.seg-maintenance { background: #3b82f6; }
.seg-unknown { background: #333; }
</style>

<style scoped>
.heartbeat-tooltip {
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

.tooltip-time {
    font-size: 12px;
    color: #999;
    pointer-events: none;
}

.tooltip-downtime {
    margin-top: 6px;
    font-size: 12px;
    color: #e5e5e5;
    pointer-events: none;
}

.tooltip-incident {
    margin-top: 6px;
    font-size: 12px;
    color: #f87171;
    cursor: pointer;
    pointer-events: auto;
    text-decoration: underline;
    text-underline-offset: 2px;
}

.tooltip-incident:hover {
    color: #fca5a5;
}

body.dark .modal-content,
.overview-standalone .modal-content {
    background: #1a1a1a;
    border-color: #333;
    color: #e5e5e5;
}

body.dark .modal-header,
.overview-standalone .modal-header {
    border-bottom-color: #333;
}

body.dark .modal-header .btn-close,
.overview-standalone .modal-header .btn-close {
    filter: invert(1) grayscale(100%) brightness(200%);
}

body.dark .modal-body,
.overview-standalone .modal-body {
    background: #1a1a1a;
}

body.dark .modal-backdrop + .modal,
.overview-standalone ~ .modal {
    --bs-modal-bg: #1a1a1a;
}
</style>
