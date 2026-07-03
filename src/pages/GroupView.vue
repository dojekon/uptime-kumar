<template>
    <div class="group-view">
        <div class="mb-4">
            <router-link to="/overview" class="btn btn-sm btn-outline-secondary mb-2">
                <font-awesome-icon icon="arrow-left" />
                {{ $t("overview") }}
            </router-link>
            <h2 v-if="group">{{ group.name }}</h2>
        </div>

        <div v-if="children.length === 0" class="text-center text-muted py-4">
            {{ $t("No monitors") }}
        </div>

        <div class="shadow-box table-shadow-box">
            <table class="table table-borderless table-hover mb-0">
                <thead>
                    <tr>
                        <th>{{ $t("Status") }}</th>
                        <th>{{ $t("Name") }}</th>
                        <th>{{ $t("Message") }}</th>
                        <th>{{ $t("24h") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="monitor in children"
                        :key="monitor.id"
                        class="monitor-row"
                        @click="goToMonitor(monitor.id)"
                    >
                        <td><Status :status="monitorStatus(monitor.id)" /></td>
                        <td>
                            <strong>{{ monitor.name }}</strong>
                            <div v-if="monitor.tags && monitor.tags.length > 0" class="mt-1">
                                <Tag v-for="tag in monitor.tags" :key="tag.tag_id" :item="tag" :size="'sm'" />
                            </div>
                        </td>
                        <td class="text-muted small">
                            {{ heartbeatMsg(monitor.id) }}
                        </td>
                        <td>
                            <Uptime :monitor="monitor" type="24" />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
import Status from "../components/Status.vue";
import Tag from "../components/Tag.vue";
import Uptime from "../components/Uptime.vue";

export default {
    components: {
        Status,
        Tag,
        Uptime,
    },
    computed: {
        groupId() {
            return this.$route.params.id;
        },

        group() {
            return this.$root.monitorList[this.groupId];
        },

        children() {
            if (!this.group) return [];
            return Object.values(this.$root.monitorList)
                .filter((m) => m.parent === parseInt(this.groupId))
                .sort((a, b) => a.weight !== b.weight ? b.weight - a.weight : a.name.localeCompare(b.name));
        },
    },
    methods: {
        monitorStatus(monitorId) {
            const status = this.$root.statusList[monitorId];
            return status ? status.status : -1;
        },

        heartbeatMsg(monitorId) {
            const beat = this.$root.lastHeartbeatList[monitorId];
            if (!beat) return "";
            return beat.msg || "";
        },

        goToMonitor(id) {
            this.$router.push("/dashboard/" + id);
        },
    },
};
</script>

<style scoped>
.monitor-row {
    cursor: pointer;
}
.monitor-row:hover {
    background-color: rgba(0, 0, 0, 0.025);
}
</style>
