<template>
    <div class="shadow-box table-shadow-box">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">{{ $t("monitorIncidents") }}</h5>
            <button class="btn btn-sm btn-primary" @click="$emit('create')">
                <font-awesome-icon icon="plus" />
                {{ $t("createIncidentReport") }}
            </button>
        </div>

        <div v-if="incidents.length === 0" class="text-center text-muted py-3">
            {{ $t("noIncidents") }}
        </div>

        <table v-else class="table table-borderless table-hover">
            <thead>
                <tr>
                    <th>{{ $t("incidentTitle") }}</th>
                    <th>{{ $t("incidentStage") }}</th>
                    <th>{{ $t("DateTime") }}</th>
                    <th>{{ $t("Actions") }}</th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="incident in incidents"
                    :key="incident.id"
                    :class="{ 'table-active': incident.stage !== 'resolved' }"
                    class="incident-row"
                    @click="$emit('open-detail', incident)"
                >
                    <td>
                        <strong>{{ incident.title }}</strong>
                    </td>
                    <td>
                        <span class="badge" :class="stageBadgeClass(incident.stage)">
                            {{ stageLabel(incident.stage) }}
                        </span>
                    </td>
                    <td>
                        <Datetime v-if="incident.createdDate" :value="incident.createdDate" />
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm" @click.stop>
                            <button
                                v-if="incident.content"
                                class="btn btn-outline-secondary"
                                @click="toggleContent(incident.id)"
                            >
                                <font-awesome-icon :icon="expandedId === incident.id ? 'chevron-up' : 'file-alt'" />
                            </button>
                            <button
                                v-if="incident.active"
                                class="btn btn-outline-primary"
                                @click="$emit('edit', incident)"
                            >
                                <font-awesome-icon icon="edit" />
                            </button>
                            <button
                                v-if="incident.active"
                                class="btn btn-outline-success"
                                :disabled="!canResolve"
                                :title="canResolve ? '' : $t('resolveOnlyWhenUp')"
                                @click="$emit('resolve', incident)"
                            >
                                <font-awesome-icon icon="check" />
                            </button>
                        </div>
                    </td>
                </tr>
                <tr v-if="expandedContent" class="incident-content-row">
                    <td colspan="4">
                        <div class="incident-content-preview" v-html="expandedContent" />
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script>
import Datetime from "./Datetime.vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

export default {
    components: {
        Datetime,
    },
    props: {
        incidents: {
            type: Array,
            default: () => [],
        },
        canResolve: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            expandedId: null,
        };
    },
    computed: {
        expandedContent() {
            if (!this.expandedId) return null;
            const inc = this.incidents.find((i) => i.id === this.expandedId);
            if (!inc || !inc.content) return null;
            return DOMPurify.sanitize(marked.parse(inc.content));
        },
    },
    methods: {
        stageBadgeClass(stage) {
            if (stage === "recorded") return "bg-danger";
            if (stage === "in_progress") return "bg-warning text-dark";
            if (stage === "resolved") return "bg-success";
            return "bg-secondary";
        },
        stageLabel(stage) {
            if (stage === "recorded") return this.$t("incidentStageRecorded");
            if (stage === "in_progress") return this.$t("incidentStageInProgress");
            if (stage === "resolved") return this.$t("incidentStageResolved");
            return stage;
        },
        toggleContent(id) {
            this.expandedId = this.expandedId === id ? null : id;
        },
    },
};
</script>

<style scoped>
.incident-row {
    cursor: pointer;
}

.incident-row:hover {
    background-color: rgba(0, 0, 0, 0.03);
}

.incident-content-row td {
    padding: 0 16px 12px;
}

.incident-content-preview {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 13px;
    line-height: 1.5;
    max-height: 300px;
    overflow-y: auto;
}

.incident-content-preview :deep(p) {
    margin: 0 0 6px;
}

.incident-content-preview :deep(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 12px;
}
</style>
