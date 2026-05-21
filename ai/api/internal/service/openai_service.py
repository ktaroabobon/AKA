import openai
from internal.util.decode_util import decode_api_key
from internal.model.request_model import OpenAIRequest

def openai_chat(request: OpenAIRequest) -> str:
    """
    与えられたプロンプトに基づいてOpenAIからの応答を取得します。

    Args:
        request (OpenAIRequest): プロンプトと暗号化されたAPIキーを含むリクエストモデル。

    Returns:
        str: OpenAIからの応答テキスト。
    """
    # APIキーをデコード
    api_key = decode_api_key(request.encrypted_api_key)

    # OpenAIの設定を行う
    openai.api_key = api_key

    # チャットコンプリートを生成
    # try:
    #     chat_completion = openai.ChatCompletion.create(
    #         model="gpt-4o-mini",
    #         messages=[
    #             {"role": "system", "content": "You are a helpful assistant."},
    #             {"role": "user", "content": request.prompt}
    #         ]
    #     )

    #     bot_response = chat_completion["choices"][0]["message"]["content"]
    #     return bot_response
    # except openai.error.OpenAIError as e:
    #     raise ValueError(f"APIエラー: {e}") from e

    # 現在OpenAIのモデルはサポートしていない旨のエラーを返す
    return "OpenAIのモデルはサポートされていません。"
