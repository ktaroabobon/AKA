from fastapi import APIRouter, HTTPException
from internal.service.openai_service import openai_chat
from internal.service.genai_service import genai_chat
from internal.model.request_model import OpenAIRequest, GenAIRequest

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.post("/chat/openai")
def chat_with_openai(request: OpenAIRequest):
    try:
        response = openai_chat(request)
        return {"reply": response}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/chat/genai")
def chat_with_genai(request: GenAIRequest):
    try:
        response = genai_chat(request)
        return {"reply": response}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
