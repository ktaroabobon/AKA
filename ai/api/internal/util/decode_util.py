import base64

def decode_api_key(encrypted_api_key: str) -> str:
    """
    Base64でエンコードされたAPIキーをデコードします。

    Args:
        encrypted_api_key (str): Base64エンコードされたAPIキー。

    Returns:
        str: デコードされたAPIキー。
    """
    try:
        # Base64デコード
        decoded_bytes = base64.b64decode(encrypted_api_key)
        # バイトを文字列に変換
        decoded_api_key = decoded_bytes.decode('utf-8')
        return decoded_api_key
    except (base64.binascii.Error, UnicodeDecodeError) as e:
        raise ValueError("APIキーのデコードに失敗しました。入力が正しいBase64エンコード形式であることを確認してください。") from e
