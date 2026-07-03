<template>
    <div class="modal fade" ref="modal" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        {{ $t(isEdit ? "editIncident" : "createIncidentReport") }}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" />
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="incident-title" class="form-label">{{ $t("incidentTitle") }}</label>
                        <input
                            id="incident-title"
                            v-model="form.title"
                            type="text"
                            class="form-control"
                            required
                        />
                    </div>

                    <div class="mb-3">
                        <label for="incident-stage" class="form-label">{{ $t("incidentStage") }}</label>
                        <select id="incident-stage" v-model="form.stage" class="form-select">
                            <option value="recorded">{{ $t("incidentStageRecorded") }}</option>
                            <option value="in_progress">{{ $t("incidentStageInProgress") }}</option>
                            <option v-if="isEdit && !isActive" value="resolved">{{ $t("incidentStageResolved") }}</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="incident-content" class="form-label">
                            {{ $t("incidentContent") }}
                            <small class="text-muted">(Markdown)</small>
                        </label>
                        <textarea
                            id="incident-content"
                            v-model="form.content"
                            class="form-control"
                            rows="8"
                        />
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        {{ $t("Cancel") }}
                    </button>
                    <button type="button" class="btn btn-primary" :disabled="!form.title" @click="save">
                        {{ $t("Save") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { Modal } from "bootstrap";

export default {
    props: {
        isEdit: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    data() {
        return {
            form: {
                title: "",
                content: "",
                stage: "recorded",
            },
            modal: null,
        };
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },
    methods: {
        show(incident) {
            if (incident) {
                this.form.title = incident.title || "";
                this.form.content = incident.content || "";
                this.form.stage = incident.stage || "recorded";
            } else {
                this.form.title = "";
                this.form.content = "";
                this.form.stage = "recorded";
            }
            this.modal.show();
        },
        hide() {
            this.modal.hide();
        },
        save() {
            this.$emit("save", { ...this.form });
            this.modal.hide();
        },
    },
};
</script>
