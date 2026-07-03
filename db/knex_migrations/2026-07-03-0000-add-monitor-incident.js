exports.up = function (knex) {
    return knex.schema
        .table("monitor", function (table) {
            table.integer("require_incident_report").notNullable().defaultTo(0);
        })
        .createTable("monitor_incident", function (table) {
            table.increments("id");
            table.integer("monitor_id").notNullable().references("id").inTable("monitor");
            table.string("title", 255).notNullable();
            table.text("content");
            table.string("stage", 20).notNullable().defaultTo("recorded");
            table.dateTime("created_date").defaultTo(knex.fn.now());
            table.dateTime("last_updated_date").defaultTo(knex.fn.now());
            table.dateTime("resolved_date");
            table.integer("active").notNullable().defaultTo(1);
        });
};

exports.down = function (knex) {
    return knex.schema
        .table("monitor", function (table) {
            table.dropColumn("require_incident_report");
        })
        .dropTableIfExists("monitor_incident");
};
