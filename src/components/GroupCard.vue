<template>
    <div class="group-card card mb-3" :class="borderClass" @click="goToGroup">
        <div class="card-body d-flex align-items-center">
            <div class="flex-grow-1">
                <div class="d-flex align-items-center gap-2 mb-1">
                    <span class="status-dot" :class="statusDotClass" />
                    <h5 class="card-title mb-0">{{ group.name }}</h5>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge" :class="statusBadgeClass">
                        {{ statusText }}
                    </span>
                    <span class="text-muted small">
                        {{ $t("nOfTotalAvailable", { n: availableCount, total: children.length }) }}
                    </span>
                </div>
                <div class="uptime-bar-row mt-2">
                    <div
                        v-for="(child, index) in children"
                        :key="child.id"
                        class="uptime-bar-segment"
                        :class="childStatusClass(child.id)"
                        :title="child.name"
                    />
                </div>
            </div>
            <div class="ms-3 text-muted">
                <font-awesome-icon icon="chevron-right" />
            </div>
        </div>
    </div>
</template>

<script>
import { UP, DOWN, PENDING, MAINTENANCE } from "../util.ts";

export default {
    props: {
        group: {
            type: Object,
            required: true,
        },
        children: {
            type: Array,
            default: () => [],
        },
    },
    computed: {
        availableCount() {
            return this.children.filter((m) => this.childStatus(m.id) === UP).length;
        },

        overallStatus() {
            if (this.children.length === 0) return "unknown";
            const hasDown = this.children.some((m) => this.childStatus(m.id) === DOWN);
            if (hasDown) return "down";
            const hasPending = this.children.some((m) => this.childStatus(m.id) === PENDING);
            if (hasPending) return "pending";
            const allUp = this.children.every((m) => this.childStatus(m.id) === UP);
            if (allUp) return "up";
            return "unknown";
        },

        borderClass() {
            if (this.overallStatus === "up") return "border-left-green";
            if (this.overallStatus === "down") return "border-left-red";
            if (this.overallStatus === "pending") return "border-left-yellow";
            return "border-left-secondary";
        },

        statusDotClass() {
            if (this.overallStatus === "up") return "bg-green";
            if (this.overallStatus === "down") return "bg-danger";
            if (this.overallStatus === "pending") return "bg-warning";
            return "bg-secondary";
        },

        statusBadgeClass() {
            if (this.overallStatus === "up") return "bg-success";
            if (this.overallStatus === "down") return "bg-danger";
            if (this.overallStatus === "pending") return "bg-warning text-dark";
            return "bg-secondary";
        },

        statusText() {
            if (this.overallStatus === "up") return this.$t("Up");
            if (this.overallStatus === "down") return this.$t("Down");
            if (this.overallStatus === "pending") return this.$t("Pending");
            return this.$t("Unknown");
        },
    },
    methods: {
        childStatus(monitorId) {
            const status = this.$root.statusList[monitorId];
            if (status && status.status !== undefined) {
                return status.status;
            }
            return -1;
        },

        childStatusClass(monitorId) {
            const s = this.childStatus(monitorId);
            if (s === UP) return "uptime-up";
            if (s === DOWN) return "uptime-down";
            if (s === PENDING) return "uptime-pending";
            if (s === MAINTENANCE) return "uptime-maintenance";
            return "uptime-unknown";
        },

        goToGroup() {
            this.$router.push("/group/" + this.group.id);
        },
    },
};
</script>

<style scoped>
.group-card {
    cursor: pointer;
    border-left: 4px solid transparent;
    transition: box-shadow 0.2s;
}
.group-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.border-left-green {
    border-left-color: #22c55e;
}
.border-left-red {
    border-left-color: #ef4444;
}
.border-left-yellow {
    border-left-color: #eab308;
}
.border-left-secondary {
    border-left-color: #6c757d;
}
.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
}
.bg-green {
    background-color: #22c55e;
}
.uptime-bar-row {
    display: flex;
    gap: 2px;
    height: 6px;
}
.uptime-bar-segment {
    flex: 1;
    min-width: 4px;
    border-radius: 2px;
}
.uptime-up {
    background-color: #22c55e;
}
.uptime-down {
    background-color: #ef4444;
}
.uptime-pending {
    background-color: #eab308;
}
.uptime-maintenance {
    background-color: #3b82f6;
}
.uptime-unknown {
    background-color: #6c757d;
}
</style>
