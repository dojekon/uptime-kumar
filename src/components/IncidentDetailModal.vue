<template>
    <div ref="modal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">{{ incident ? incident.title : "" }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" />
                </div>
                <div v-if="incident" class="modal-body">
                    <div class="mb-3 d-flex align-items-center gap-2">
                        <span class="badge" :class="stageBadgeClass(incident.stage)">
                            {{ stageLabel(incident.stage) }}
                        </span>
                        <small class="text-muted">
                            {{ $t("Service") }}: {{ monitorName(incident.monitorId) }}
                        </small>
                    </div>

                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div v-if="incident.content" class="incident-content mb-3" v-html="renderedContent(incident.content)" />

                    <!-- Status Timeline -->
                    <h6 class="mb-2">{{ $t("incidentTimeline") }}</h6>
                    <ul v-if="timeline.length > 0" class="timeline mb-3">
                        <li v-for="entry in timeline" :key="entry.id" class="timeline-item">
                            <span class="badge me-2" :class="stageBadgeClass(entry.stage)">
                                {{ stageLabel(entry.stage) }}
                            </span>
                            <Datetime :value="entry.createdDate" />
                        </li>
                    </ul>
                    <p v-else class="text-muted small">{{ $t("noTimelineEntries") }}</p>

                    <!-- Active incident actions -->
                    <div v-if="incident.active" class="border-top pt-3 mt-3">
                        <h6>{{ $t("incidentActions") }}</h6>
                        <div class="d-flex gap-2">
                            <button
                                v-if="incident.stage === 'recorded'"
                                class="btn btn-warning"
                                @click="changeStage('in_progress')"
                            >
                                <font-awesome-icon icon="spinner" class="me-1" />
                                {{ $t("incidentStageInProgress") }}
                            </button>
                            <button
                                class="btn btn-success"
                                :disabled="!canResolve"
                                :title="canResolve ? '' : $t('resolveOnlyWhenUp')"
                                @click="resolveIncident"
                            >
                                <font-awesome-icon icon="check" class="me-1" />
                                {{ $t("resolveIncident") }}
                            </button>
                            <button class="btn btn-outline-danger" @click="confirmDeleteIncident">
                                <font-awesome-icon icon="trash" />
                            </button>
                        </div>
                    </div>

                    <!-- Resolved incident: Post-mortem -->
                    <div v-else class="border-top pt-3 mt-3">
                        <h6>{{ $t("postMortemReport") }}</h6>
                        <div v-if="!editingPostMortem">
                            <!-- eslint-disable-next-line vue/no-v-html -->
                            <div v-if="incident.postmortem" class="postmortem-content mb-2" v-html="renderedContent(incident.postmortem)" />
                            <p v-else class="text-muted small">{{ $t("noPostMortem") }}</p>
                            <button class="btn btn-sm btn-outline-primary" @click="editingPostMortem = true">
                                <font-awesome-icon icon="edit" class="me-1" />
                                {{ incident.postmortem ? $t("editPostMortem") : $t("writePostMortem") }}
                            </button>
                        </div>
                        <div v-else>
                            <textarea
                                v-model="postMortemContent"
                                class="form-control mb-2"
                                rows="6"
                                :placeholder="$t('postMortemPlaceholder')"
                            />
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-primary" :disabled="savingPostMortem" @click="savePostMortem">
                                    <span v-if="savingPostMortem" class="spinner-border spinner-border-sm me-1" />
                                    {{ $t("Save") }}
                                </button>
                                <button class="btn btn-sm btn-secondary" @click="editingPostMortem = false">
                                    {{ $t("Cancel") }}
                                </button>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline-danger mt-3" @click="confirmDeleteIncident">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <Confirm
            ref="confirmDelete"
            btn-style="btn-danger"
            :yes-text="$t('Yes')"
            :no-text="$t('No')"
            @yes="doDelete"
        >
            {{ $t("deleteIncidentMsg") }}
        </Confirm>
    </div>
</template>

<script>
import { Modal } from "bootstrap";
import Datetime from "./Datetime.vue";
import Confirm from "./Confirm.vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { UP } from "../util.ts";

export default {
    components: {
        Datetime,
        Confirm,
    },
    emits: ["updated"],
    data() {
        return {
            modal: null,
            incident: null,
            timeline: [],
            editingPostMortem: false,
            postMortemContent: "",
            savingPostMortem: false,
        };
    },
    computed: {
        canResolve() {
            if (!this.incident) {
                return false;
            }
            const lastBeat = this.$root.lastHeartbeatList[this.incident.monitorId];
            return lastBeat && lastBeat.status === UP;
        },
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },
    methods: {
        show(incidentId) {
            this.incident = null;
            this.timeline = [];
            this.editingPostMortem = false;
            this.$root.getSocket().emit("getIncidentDetail", incidentId, (res) => {
                if (res.ok) {
                    this.incident = res.incident;
                    this.timeline = res.timeline;
                    this.postMortemContent = res.incident.postmortem || "";
                } else {
                    this.$root.toastError(res.msg);
                }
                this.modal.show();
            });
        },
        hide() {
            this.modal.hide();
        },
        monitorName(monitorId) {
            const m = this.$root.monitorList[monitorId];
            return m ? m.name : "#" + monitorId;
        },
        stageBadgeClass(stage) {
            if (stage === "recorded") {
                return "bg-danger";
            }
            if (stage === "in_progress") {
                return "bg-warning text-dark";
            }
            if (stage === "resolved") {
                return "bg-success";
            }
            return "bg-secondary";
        },
        stageLabel(stage) {
            if (stage === "recorded") {
                return this.$t("incidentStageRecorded");
            }
            if (stage === "in_progress") {
                return this.$t("incidentStageInProgress");
            }
            if (stage === "resolved") {
                return this.$t("incidentStageResolved");
            }
            return stage;
        },
        renderedContent(content) {
            if (!content) {
                return "";
            }
            return DOMPurify.sanitize(marked.parse(content));
        },
        changeStage(newStage) {
            this.$root.getSocket().emit("changeIncidentStage", this.incident.id, newStage, (res) => {
                if (res.ok) {
                    this.incident = res.incident;
                    this.timeline = res.timeline;
                } else {
                    this.$root.toastError(res.msg);
                }
                this.$emit("updated");
            });
        },
        resolveIncident() {
            const status = this.canResolve ? UP : 0;
            this.$root.getSocket().emit("resolveMonitorIncident", this.incident.id, status, (res) => {
                if (res.ok) {
                    this.incident = res.incident;
                    this.timeline = res.timeline;
                } else {
                    this.$root.toastError(res.msg);
                }
                this.$emit("updated");
            });
        },
        savePostMortem() {
            this.savingPostMortem = true;
            this.$root.getSocket().emit("savePostMortem", this.incident.id, this.postMortemContent, (res) => {
                this.savingPostMortem = false;
                if (res.ok) {
                    this.incident = res.incident;
                    this.editingPostMortem = false;
                } else {
                    this.$root.toastError(res.msg);
                }
                this.$emit("updated");
            });
        },
        confirmDeleteIncident() {
            this.$refs.confirmDelete.show();
        },
        doDelete() {
            this.$root.getSocket().emit("deleteMonitorIncident", this.incident.id, (res) => {
                if (res.ok) {
                    this.modal.hide();
                } else {
                    this.$root.toastError(res.msg);
                }
                this.$emit("updated");
            });
        },
    },
};
</script>

<style scoped>
.incident-content {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.6;
}

.timeline {
    list-style: none;
    padding: 0;
    margin: 0;
}

.timeline-item {
    padding: 4px 0 4px 20px;
    border-left: 2px solid #dee2e6;
    margin-left: 8px;
    font-size: 13px;
}

.timeline-item:last-child {
    border-left-color: transparent;
}

.postmortem-content {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.6;
}
</style>
