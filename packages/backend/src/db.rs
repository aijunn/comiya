use anyhow::Result;
use entity::{history, lib_comic};
use sea_orm::{
    sea_query::OnConflict, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder,
    Set,
};

pub async fn upsert_history(db: &DatabaseConnection, item: history::ActiveModel) -> Result<()> {
    history::Entity::insert(item)
        .on_conflict(
            OnConflict::columns([history::Column::Source, history::Column::ComicId])
                .update_columns([
                    history::Column::ChapterId,
                    history::Column::ChapterName,
                    history::Column::ComicName,
                    history::Column::Page,
                    history::Column::Visible,
                    history::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec(db)
        .await?;

    Ok(())
}

pub async fn get_history(db: &DatabaseConnection) -> Result<Vec<history::Model>> {
    let list = history::Entity::find()
        .order_by_desc(history::Column::UpdatedAt)
        .all(db)
        .await?;
    Ok(list)
}

pub async fn get_comic_history(
    db: &DatabaseConnection,
    source: &str,
    comic_id: &str,
) -> Result<Option<history::Model>> {
    let item = history::Entity::find()
        .filter(history::Column::Source.eq(source))
        .filter(history::Column::ComicId.eq(comic_id))
        .one(db)
        .await?;
    Ok(item)
}

pub async fn delete_history(db: &DatabaseConnection, source: &str, comic_id: &str) -> Result<()> {
    history::Entity::update(history::ActiveModel {
        source: Set(source.to_string()),
        comic_id: Set(comic_id.to_string()),
        visible: Set(false),
        ..Default::default()
    })
    .filter(history::Column::Source.eq(source))
    .filter(history::Column::ComicId.eq(comic_id))
    .exec(db)
    .await?;
    Ok(())
}

pub async fn get_library(db: &DatabaseConnection) -> Result<Vec<lib_comic::Model>> {
    let list = lib_comic::Entity::find()
        .order_by_desc(lib_comic::Column::CreatedAt)
        .all(db)
        .await?;
    Ok(list)
}

pub async fn add_to_library(db: &DatabaseConnection, item: lib_comic::ActiveModel) -> Result<()> {
    lib_comic::Entity::insert(item)
        .on_conflict(
            OnConflict::columns([lib_comic::Column::Source, lib_comic::Column::Id])
                .do_nothing()
                .to_owned(),
        )
        .exec(db)
        .await?;
    Ok(())
}

pub async fn remove_from_library(db: &DatabaseConnection, source: &str, id: &str) -> Result<()> {
    lib_comic::Entity::delete_many()
        .filter(lib_comic::Column::Source.eq(source))
        .filter(lib_comic::Column::Id.eq(id))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn check_in_library(db: &DatabaseConnection, source: &str, id: &str) -> Result<bool> {
    let in_library = lib_comic::Entity::find()
        .filter(lib_comic::Column::Source.eq(source))
        .filter(lib_comic::Column::Id.eq(id))
        .one(db)
        .await?;
    Ok(in_library.is_some())
}
