use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComicBrief {
    pub source: String,
    pub id: String,
    pub name: String,
    pub cover: String,
    pub author: Vec<String>,
    pub intro: String,
    pub pub_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComicChapterBrief {
    pub source: String,
    pub id: String,
    pub comic_id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComicChapterGroup {
    pub name: String,
    pub chapters: Vec<ComicChapterBrief>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comic {
    pub source: String,
    pub id: String,
    pub name: String,
    pub cover: String,
    pub author: Vec<String>,
    pub intro: String,
    pub pub_date: String,
    pub chapter_groups: Vec<ComicChapterGroup>,
    pub first_chapter_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComicChapter {
    pub source: String,
    pub id: String,
    pub comic_id: String,
    pub name: String,
    pub comic_name: String,
    pub next_id: String,
    pub prev_id: String,
    pub images: Vec<String>,
}
