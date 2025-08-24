// services/googleDocs.js - Claude v27 - Google Docs creation service
import { google } from "googleapis";
import { ENV } from "../config/env.js";

// Google Drive Folder IDs
const GOOGLE_FOLDERS = {
  CREATED: "1YgugDvpJNoLUITNw5YaC0jy22ybl5d9t", // Created board folder
  PURCHASED: "1MZMidayqFqiPR8i2uNqXOSUiIz_FBxPj", // Purchased board folder
};

const ADMIN_EMAIL = "info@taledofme.io";

// Initialize Google Auth
function createGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    ENV.GOOGLE_CLIENT_ID,
    ENV.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground" // redirect URL
  );

  oauth2Client.setCredentials({
    refresh_token: ENV.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

// Format generated pages content for Google Docs
function formatContentForGoogleDocs(generatedPages, bookTitle) {
  const requests = [];
  let index = 1;

  // Title
  requests.push({
    insertText: {
      location: { index },
      text: `Generated Pages for: ${bookTitle}\n\n`,
    },
  });
  index += `Generated Pages for: ${bookTitle}\n\n`.length;

  // Style the title
  requests.push({
    updateTextStyle: {
      range: {
        startIndex: 1,
        endIndex: `Generated Pages for: ${bookTitle}`.length + 1,
      },
      textStyle: {
        bold: true,
        fontSize: { magnitude: 16, unit: "PT" },
      },
      fields: "bold,fontSize",
    },
  });

  // Metadata
  const metadata = `Generated: ${new Date().toLocaleString()}\nTotal Pages: ${
    generatedPages.length
  }\n\n${"=".repeat(50)}\n\n`;
  requests.push({
    insertText: {
      location: { index },
      text: metadata,
    },
  });
  index += metadata.length;

  // Add each page
  generatedPages.forEach((page, pageIndex) => {
    // Page header
    const pageHeader = `📖 Page ${pageIndex + 1}: ${page.headline}\n\n`;
    requests.push({
      insertText: {
        location: { index },
        text: pageHeader,
      },
    });

    // Style the page header
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: index,
          endIndex: index + pageHeader.length - 2,
        },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 14, unit: "PT" },
        },
        fields: "bold,fontSize",
      },
    });

    index += pageHeader.length;

    // Page content
    const pageContent = `${page.text}\n\n${"-".repeat(50)}\n\n`;
    requests.push({
      insertText: {
        location: { index },
        text: pageContent,
      },
    });
    index += pageContent.length;
  });

  return requests;
}

// Create Google Doc with generated pages
export async function createGoogleDocWithPages(
  generatedPages,
  bookTitle,
  boardType
) {
  if (
    !generatedPages ||
    !Array.isArray(generatedPages) ||
    generatedPages.length === 0
  ) {
    console.log("📄 No generated pages to create Google Doc");
    return null;
  }

  const folderId = GOOGLE_FOLDERS[boardType];
  if (!folderId) {
    console.error(`📄 No folder configured for board type: ${boardType}`);
    return null;
  }

  console.log(`📄 Creating Google Doc for ${boardType} board...`);
  console.log(`📄 Book: ${bookTitle}`);
  console.log(`📄 Pages: ${generatedPages.length}`);

  try {
    const auth = createGoogleAuth();
    const docs = google.docs({ version: "v1", auth });
    const drive = google.drive({ version: "v3", auth });

    // 1. Create the document
    console.log("📄 Creating Google Doc...");
    const doc = await docs.documents.create({
      resource: {
        title: `Generated Pages - ${bookTitle} - ${new Date().toLocaleDateString()}`,
      },
    });

    const docId = doc.data.documentId;
    console.log(`📄 Document created with ID: ${docId}`);

    // 2. Add content to the document
    console.log("📄 Adding content to document...");
    const contentRequests = formatContentForGoogleDocs(
      generatedPages,
      bookTitle
    );

    await docs.documents.batchUpdate({
      documentId: docId,
      resource: { requests: contentRequests },
    });

    console.log("📄 Content added successfully");

    // 3. Move to specified folder
    console.log(`📄 Moving document to folder: ${folderId}`);
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      removeParents: "root",
    });

    // 4. Share with admin email (edit permissions)
    console.log(`📄 Sharing document with: ${ADMIN_EMAIL}`);
    await drive.permissions.create({
      fileId: docId,
      resource: {
        role: "writer",
        type: "user",
        emailAddress: ADMIN_EMAIL,
      },
      sendNotificationEmail: false, // Don't spam with notifications
    });

    const docUrl = `https://docs.google.com/document/d/${docId}`;

    console.log("📄 Google Doc created successfully!");
    console.log(`📄 URL: ${docUrl}`);

    return {
      docId,
      docUrl,
      title: `Generated Pages - ${bookTitle}`,
      pageCount: generatedPages.length,
    };
  } catch (error) {
    console.error("❌ Error creating Google Doc:", error);

    // Log specific error details
    if (error.response) {
      console.error("📄 Google API Error Response:", error.response.data);
    }

    return null;
  }
}
