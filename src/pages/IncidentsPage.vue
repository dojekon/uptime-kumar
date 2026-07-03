<template>
    <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">{{ $t("monitorIncidents") }}</h4>
        </div>

        <div v-if="incidents.length === 0 && loaded" class="text-center text-muted py-5">
            {{ $t("noIncidents") }}
        </div>

        <div v-if="incidents.length > 0" class="shadow-box table-shadow-box">
            <table class="table table-borderless table-hover mb-0">
                <thead>
                    <tr>
                        <th>{{ $t("Name") }}</th>
                        <th>{{ $t("incidentTitle") }}</th>
                        <th>{{ $t("incidentStage") }}</th>
                        <th>{{ $t("DateTime") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="incident in incidents"
                        :key="incident.id"
                        class="incident-row"
                        :class="{ 'table-active': incident.active }"
                        @click="openDetail(incident)"
                    >
                        <td>
                            <router-link
                                :to="'/dashboard/' + incident.monitorId"
                                class="monitor-link"
                                @click.stop
                            >
                                {{ monitorName(incident.monitorId) }}
                            </router-link>
                        </td>
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
                    </tr>
                </tbody>
            </table>
        </div>

        <IncidentDetailModal ref="detailModal" @updated="loadIncidents" />
    </div>
</template>

<script>
import Datetime from "../components/Datetime.vue";
import IncidentDetailModal from "../components/IncidentDetailModal.vue";

export default {
    components: {
        Datetime,
        IncidentDetailModal,
    },
    data() {
        return {
            incidents: [],
            loaded: false,
        };
    },
    mounted() {
        this.loadIncidents();
    },
    methods: {
        loadIncidents() {
            this.$root.getSocket().emit("getAllMonitorIncidents", (res) => {
                if (res.ok) {
                    this.incidents = res.incidents || [];
                }
                this.loaded = true;
            });
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
        openDetail(incident) {
            this.$refs.detailModal.show(incident.id);
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

.monitor-link {
    color: inherit;
    text-decoration: none;
    font-weight: 500;
}

.monitor-link:hover {
    text-decoration: underline;
}
</style>
