use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PtyError {
    pub message: String,
}

impl std::fmt::Display for PtyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl From<std::io::Error> for PtyError {
    fn from(err: std::io::Error) -> Self {
        PtyError {
            message: err.to_string(),
        }
    }
}

impl From<Box<dyn std::error::Error>> for PtyError {
    fn from(err: Box<dyn std::error::Error>) -> Self {
        PtyError {
            message: err.to_string(),
        }
    }
}

impl From<Box<dyn std::error::Error + Send + Sync>> for PtyError {
    fn from(err: Box<dyn std::error::Error + Send + Sync>) -> Self {
        PtyError {
            message: err.to_string(),
        }
    }
}

impl From<String> for PtyError {
    fn from(err: String) -> Self {
        PtyError { message: err }
    }
}

impl From<anyhow::Error> for PtyError {
    fn from(err: anyhow::Error) -> Self {
        PtyError {
            message: err.to_string(),
        }
    }
}
