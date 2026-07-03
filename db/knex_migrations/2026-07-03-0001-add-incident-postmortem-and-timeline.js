exports.up = function (knex) {
    return knex.schema
        .table("monitor_incident", function (table) {
            table.text("postmortem");
        })
        .createTable("incident_status_timeline", function (table) {
            table.increments("id");
            table.integer("incident_id").notNullable().references("id").inTable("monitor_incident").onDelete("CASCADE");
            table.string("stage", 20).notNullable();
            table.dateTime("created_date").defaultTo(knex.fn.now());
        });
};

exports.down = function (knex) {
    return knex.schema
        .table("monitor_incident", function (table) {
            table.dropColumn("postmortem");
        })
        .dropTableIfExists("incident_status_timeline");
};
