
require("dotenv").config();

async function main() {
  const response = await fetch(
    "https://factchat-cloud.mindlogic.ai/v1/gateway/models/?type=llm",
    {
      headers: {
        Authorization:
          `Bearer ${process.env.CHATKHU_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Model API error: ${response.status}`
    );
  }

  const result = await response.json();

  const models = Array.isArray(result)
    ? result
    : result.data ?? result.results ?? [];

  console.log(
    JSON.stringify(models, null, 2)
  );
}

main().catch(console.error);
