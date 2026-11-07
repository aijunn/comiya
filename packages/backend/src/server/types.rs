use axum::{
    response::{IntoResponse, Response},
    Json,
};
use reqwest::StatusCode;
use serde::Serialize;

#[derive(Serialize)]
pub struct Resp<T>
where
    T: Serialize,
{
    pub code: i32,
    pub msg: String,
    pub data: Option<T>,
}

pub struct AppError {
    status: StatusCode,
    error: anyhow::Error,
}

impl AppError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            error: anyhow::anyhow!(message.into()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(Resp::<()> {
                code: -1,
                msg: self.error.to_string(),
                data: None,
            }),
        )
            .into_response()
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error: value.into(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
