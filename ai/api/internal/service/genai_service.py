import google.generativeai as genai

from internal.util.decode_util import decode_api_key
from internal.model.request_model import GenAIRequest
from internal.util import personality_util

def genai_chat(request: GenAIRequest) -> str:
    """
    与えられたプロンプトに基づいて生成AIからの応答を取得します。

    Args:
        prompt (str): ユーザーからのプロンプト。
        encrypted_api_key (str): Base64エンコードされたAPIキー。

    Returns:
        str: 生成AIからの応答テキスト。
    """
    # APIキーをデコード
    api_key = decode_api_key(request.encrypted_api_key)

    # GenAIの設定を行う
    genai.configure(api_key=api_key)

    # モデルのインスタンスを作成
    model = genai.GenerativeModel('gemini-2.0-flash-thinking-exp-01-21')

    # プロンプトに基づいてコンテンツを生成
    try:
        prompt = f"{personality_util.background}\n{request.prompt}"
        response = model.generate_content(prompt)
        return response.text
    except genai.exceptions.APIError as e:
        raise ValueError(f"APIエラー: {e}") from e

