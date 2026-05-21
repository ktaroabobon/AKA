from pydantic import BaseModel

class GenAIRequest(BaseModel):
    prompt: str
    encrypted_api_key: str

class OpenAIRequest(BaseModel):
    prompt: str
    encrypted_api_key: str