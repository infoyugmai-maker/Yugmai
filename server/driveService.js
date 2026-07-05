import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

let driveClient = null;

function getDriveClient() {
  if (!driveClient) {
    if (process.env.GDRIVE_CLIENT_ID && process.env.GDRIVE_CLIENT_SECRET && process.env.GDRIVE_REFRESH_TOKEN) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
        'http://localhost:3001'
      );
      oauth2Client.setCredentials({ refresh_token: process.env.GDRIVE_REFRESH_TOKEN });
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    } else {
      const keyPath = path.resolve('driveCredentials.json');
      if (!fs.existsSync(keyPath)) {
        throw new Error("Missing Google Drive OAuth credentials in .env OR driveCredentials.json not found.");
      }
      const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
      });
      driveClient = google.drive({ version: 'v3', auth });
    }
  }
  return driveClient;
}

// Check if a folder exists with the given name inside the parent folder
async function getFolderByNameAndParent(folderName, parentId) {
  const drive = getDriveClient();
  const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }
  return null;
}

// Create a new folder inside the given parent
async function createFolder(folderName, parentId) {
  const drive = getDriveClient();
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };
  const res = await drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });
  return res.data.id;
}

// Recursively ensure a folder path exists
export async function ensurePath(pathArray, rootFolderId) {
  let currentParentId = rootFolderId;
  for (const folderName of pathArray) {
    if (!folderName) continue; // skip empty
    let folderId = await getFolderByNameAndParent(folderName, currentParentId);
    if (!folderId) {
      folderId = await createFolder(folderName, currentParentId);
    }
    currentParentId = folderId;
  }
  return currentParentId;
}

// Upload a file to a specific folder
export async function uploadFileToDrive(fileStream, mimeType, fileName, parentId) {
  const drive = getDriveClient();
  const fileMetadata = {
    name: fileName,
    parents: [parentId],
  };
  const media = {
    mimeType: mimeType,
    body: fileStream,
  };
  const res = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webViewLink, webContentLink',
  });
  
  // Make the file readable by anyone with the link so it can be previewed/downloaded without access requests
  try {
    await drive.permissions.create({
      fileId: res.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      }
    });
  } catch (err) {
    console.error("Error setting file to public:", err);
  }

  return { id: res.data.id, link: res.data.webViewLink, download: res.data.webContentLink };
}

// Delete a file from Drive
export async function deleteFileFromDrive(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
  return true;
}
