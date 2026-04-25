import { Hono } from "hono";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getUser } from "../kinde";

const s3 = new S3Client({
    region: process.env.AWS_BUCKET_REGION,
});

const maxFileSize = 1024 * 1024 * 10; // 10 MB

export const signedUrlRoute = new Hono()
    .get('/', getUser, async (c) => {
        try {
            const putObjectCommand = new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME!,
                Key: `${Date.now()}.jpg`, // Use a unique key for each upload
            });

            const signedURL = await getSignedUrl(s3, putObjectCommand, {
                expiresIn: 60
            });

            return c.json({ success: true, signedURL });
        } catch (error) {
            console.error('Error generating signed URL:', error);
            return c.json({ success: false, error: 'Failed to generate signed URL' }, 500);
        }
    });
