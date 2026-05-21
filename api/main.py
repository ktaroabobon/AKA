from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from internal.util.init_util import init
from internal.controller.chat_controller import router
import uvicorn

init()

app = FastAPI(
    servers=[
        {
            "url": "http://localhost:8000",
            "description": "ローカル開発環境"
        },
        {
            "url": "https://aka-ai-api-service-lp2rjkac3a-an.a.run.app",
            "description": "本番環境"
        }
    ]
)

origins = [
    "http://localhost:8000",
    "https://aka-ai-web-service-lp2rjkac3a-an.a.run.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
