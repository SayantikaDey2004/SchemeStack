from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise ValueError("GEMINI_API_KEY not found")

client = genai.Client(api_key=api_key)


def generate_ai_reply(user_query, schemes):
    prompt = f"""
    User query: {user_query}

    Available schemes:
    {schemes}

    Instructions:
    - Answer in a helpful and friendly way
    - Show only relevant schemes
    - If nothing matches, say no scheme found
    """

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    return response.text