/*
  DELETE-PHOTO FUNCTION
  -----------------------
  Removes a photo entry from content/<category>.json and deletes the
  underlying image file from the repo. Uses the same environment
  variables as upload-photo.js.
*/

const ALLOWED_CATEGORIES = [
  'gallery', 'school-uniform', 'festive', 'ethnic', 'casual', 'mens', 'womens'
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { password, category, imagePath } = payload;

  if (password !== process.env.STAFF_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password' }) };
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown category' }) };
  }
  if (!imagePath) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No image specified' }) };
  }

  const GH_TOKEN = process.env.GH_TOKEN;
  const GH_REPO = process.env.GH_REPO;
  const GH_BRANCH = process.env.GH_BRANCH || 'main';
  const API = `https://api.github.com/repos/${GH_REPO}`;
  const headers = {
    Authorization: `token ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Fetch current content/<category>.json
    const jsonPath = `content/${category}.json`;
    const getRes = await fetch(`${API}/contents/${jsonPath}?ref=${GH_BRANCH}`, { headers });
    if (!getRes.ok) throw new Error('Could not read photo list');
    const getData = await getRes.json();
    const currentContent = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf-8'));
    const photos = (currentContent.photos || []).filter(p => p.image !== imagePath);

    // 2. Save the updated list back
    const updatedBase64 = Buffer.from(JSON.stringify({ photos }, null, 2)).toString('base64');
    const putRes = await fetch(`${API}/contents/${jsonPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Remove photo from ${category} via admin panel`,
        content: updatedBase64,
        branch: GH_BRANCH,
        sha: getData.sha,
      }),
    });
    if (!putRes.ok) throw new Error('Could not update photo list');

    // 3. Try to also delete the actual image file (best-effort, don't fail the whole request if this part fails)
    try {
      const imgFilePath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
      const imgGetRes = await fetch(`${API}/contents/${imgFilePath}?ref=${GH_BRANCH}`, { headers });
      if (imgGetRes.ok) {
        const imgData = await imgGetRes.json();
        await fetch(`${API}/contents/${imgFilePath}`, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({
            message: `Delete unused photo file via admin panel`,
            sha: imgData.sha,
            branch: GH_BRANCH,
          }),
        });
      }
    } catch (e) { /* non-fatal */ }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Something went wrong' }),
    };
  }
};
