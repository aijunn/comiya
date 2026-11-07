use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const LEGACY_SOURCE: &str = "manhuagui";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // SQLite cannot change a primary key in place, so rebuild both tables.
        db.execute_unprepared("ALTER TABLE history RENAME TO history_legacy")
            .await?;
        db.execute_unprepared(
            r#"
            CREATE TABLE history (
                source varchar NOT NULL,
                comic_id varchar NOT NULL,
                chapter_id varchar NOT NULL,
                comic_name varchar NOT NULL,
                chapter_name varchar NOT NULL,
                page integer NOT NULL,
                visible boolean NOT NULL,
                created_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (source, comic_id)
            )
            "#,
        )
        .await?;
        db.execute_unprepared(&format!(
            r#"
            INSERT INTO history (
                source, comic_id, chapter_id, comic_name, chapter_name,
                page, visible, created_at, updated_at
            )
            SELECT
                '{LEGACY_SOURCE}', comic_id, chapter_id, comic_name, chapter_name,
                page, visible, created_at, updated_at
            FROM history_legacy
            "#
        ))
        .await?;
        db.execute_unprepared("DROP TABLE history_legacy").await?;

        db.execute_unprepared("ALTER TABLE lib_comic RENAME TO lib_comic_legacy")
            .await?;
        db.execute_unprepared(
            r#"
            CREATE TABLE lib_comic (
                source varchar NOT NULL,
                id varchar NOT NULL,
                name varchar NOT NULL,
                cover varchar NOT NULL,
                created_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (source, id)
            )
            "#,
        )
        .await?;
        db.execute_unprepared(&format!(
            r#"
            INSERT INTO lib_comic (source, id, name, cover, created_at, updated_at)
            SELECT '{LEGACY_SOURCE}', id, name, cover, created_at, updated_at
            FROM lib_comic_legacy
            "#
        ))
        .await?;
        db.execute_unprepared("DROP TABLE lib_comic_legacy").await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // The legacy schema can only represent the original manhuagui source.
        db.execute_unprepared("ALTER TABLE history RENAME TO history_legacy")
            .await?;
        db.execute_unprepared(
            r#"
            CREATE TABLE history (
                comic_id varchar NOT NULL PRIMARY KEY,
                chapter_id varchar NOT NULL,
                comic_name varchar NOT NULL,
                chapter_name varchar NOT NULL,
                page integer NOT NULL,
                visible boolean NOT NULL,
                created_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .await?;
        db.execute_unprepared(&format!(
            r#"
            INSERT INTO history (
                comic_id, chapter_id, comic_name, chapter_name,
                page, visible, created_at, updated_at
            )
            SELECT
                comic_id, chapter_id, comic_name, chapter_name,
                page, visible, created_at, updated_at
            FROM history_legacy
            WHERE source = '{LEGACY_SOURCE}'
            "#
        ))
        .await?;
        db.execute_unprepared("DROP TABLE history_legacy").await?;

        db.execute_unprepared("ALTER TABLE lib_comic RENAME TO lib_comic_legacy")
            .await?;
        db.execute_unprepared(
            r#"
            CREATE TABLE lib_comic (
                id varchar NOT NULL PRIMARY KEY,
                name varchar NOT NULL,
                cover varchar NOT NULL,
                created_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at timestamp_text NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .await?;
        db.execute_unprepared(&format!(
            r#"
            INSERT INTO lib_comic (id, name, cover, created_at, updated_at)
            SELECT id, name, cover, created_at, updated_at
            FROM lib_comic_legacy
            WHERE source = '{LEGACY_SOURCE}'
            "#
        ))
        .await?;
        db.execute_unprepared("DROP TABLE lib_comic_legacy").await?;

        Ok(())
    }
}
