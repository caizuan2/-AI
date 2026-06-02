const form = document.querySelector("#activateForm");
const result = document.querySelector("#activateResult");
const button = document.querySelector("#activateButton");

function showResult(message, success) {
  result.hidden = false;
  result.textContent = message;
  result.className = success ? "result result-success" : "result result-error";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = document.querySelector("#code")?.value.trim();
  const userId = document.querySelector("#userId")?.value.trim();

  if (!code || !userId) {
    showResult("卡密和用户ID不能为空。", false);
    return;
  }

  button.disabled = true;
  button.textContent = "激活中...";

  try {
    const response = await fetch("/api/activate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        user_id: userId,
      }),
    });
    const data = await response.json();
    showResult(data.message || "请求完成。", Boolean(data.success));
  } catch (error) {
    showResult("网络请求失败，请稍后重试。", false);
  } finally {
    button.disabled = false;
    button.textContent = "立即激活";
  }
});
