export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Only allow POST requests for submission
    if (request.method === "POST") {
      try {
        const data = await request.json();

        // -------------------------------------------------------------
        // PRINTING / LOGGING THE DATA
        // This will show up inside your Cloudflare Worker logs console.
        // -------------------------------------------------------------
        console.log("=== NEW QUIZ SUBMISSION RECEIVIED ===");
        console.log(`User Name: ${data.userName}`);
        console.log(`Score: ${data.score} / ${data.totalQuestions}`);
        console.log(`Started: ${data.startTime}`);
        console.log(`Submitted: ${data.submitTime}`);
        console.log("--- Detailed Answers ---");
        data.answers.forEach((ans, index) => {
          console.log(`Q${index + 1}: ${ans.question}`);
          console.log(`   Selected: ${ans.selected}`);
          console.log(`   Correct:  ${ans.correct}`);
        });
        console.log("=====================================");

        // Optional: If you want to store it long term on Cloudflare, 
        // you would bind a KV namespace or D1 Database here.

        // Send successful response back to the client quiz page
        return new Response(JSON.stringify({ success: true, message: "Submission logged successfully." }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // Prevents CORS errors on your quiz site
          },
        });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: "Invalid JSON format." }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // Default response for regular GET requests hitting the worker URL directly
    return new Response("Quiz Receiver backend operational. Send a POST request with quiz results data.", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  },
};
