/*
  UPLOAD-PHOTO FUNCTION
  ----------------------
  Runs on Netlify. Receives a photo + category from the custom admin form,
  checks the staff password, then commits the photo and updates the
  matching content/<category>.json file directly in the GitHub repo —
  no third-party auth service, no client GitHub account.

  REQUIRED ENVIRONMENT VARIABLES (set these in Netlify's dashboard under
  Site configuration → Environment variables):
    STAFF_PASSWORD   - the password staff will type into the admin form
    GH_TOKEN         - a GitHub Personal Access Token with repo write access
    GH_REPO          - "yourusername/your-repo-name"
    GH_BRANCH        - usually "main"
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

  const { password, category, imageBase64, caption } = payload;

  if (password !== process.env.STAFF_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password' }) };
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown category' }) };
  }
  if (!imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No image provided' }) };
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
    // 1. Upload the image as a new file with a unique name
    const stamp = Date.now();
    const filename = `upload-${stamp}.jpg`;
    const imagePath = `images/${category}/${filename}`;
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const uploadRes = await fetch(`${API}/contents/${imagePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Add photo to ${category} via admin panel`,
        content: base64Data,
        branch: GH_BRANCH,
      }),
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Image upload failed: ${err}`);
    }

    // 2. Fetch the current content/<category>.json to get its sha + existing photos
    const jsonPath = `content/${category}.json`;
    const getRes = await fetch(`${API}/contents/${jsonPath}?ref=${GH_BRANCH}`, { headers });
    if (!getRes.ok) {
      const err = await getRes.text();
      throw new Error(`Could not read ${jsonPath}: ${err}`);
    }
    const getData = await getRes.json();
    const currentContent = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf-8'));
    const photos = currentContent.photos || [];

    // 3. Append the new photo entry (served directly from GitHub, independent of Netlify deploys)
    const imageUrl = `https://raw.githubusercontent.com/${GH_REPO}/${GH_BRANCH}/${imagePath}`;
    photos.push({ image: imageUrl, caption: caption || '' });
    const updatedContent = { photos };
    const updatedBase64 = Buffer.from(JSON.stringify(updatedContent, null, 2)).toString('base64');

    // 4. Save the updated json back
    const putRes = await fetch(`${API}/contents/${jsonPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Update ${category} photo list via admin panel`,
        content: updatedBase64,
        branch: GH_BRANCH,
        sha: getData.sha,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`Could not update ${jsonPath}: ${err}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, path: imagePath }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Something went wrong' }),
    };
  }
};
