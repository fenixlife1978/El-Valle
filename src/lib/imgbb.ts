import axios from 'axios';

const IMGBB_API_KEY = '0bb9c41b7cf8ef8b9016646c7cc6dc6d';
const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';

export interface ImgbbResponse {
  data: {
    id: string;
    title: string;
    url_viewer: string;
    url: string;
    display_url: string;
    size: number;
    time: string;
    expiration: string;
    image: {
      filename: string;
      name: string;
      mime: string;
      extension: string;
      url: string;
    };
    thumb: {
      url: string;
    };
    medium: {
      url: string;
    };
    delete_url: string;
  };
  success: boolean;
  status: number;
}

export async function uploadToImgbb(file: File): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', file);
    formData.append('expiration', '0'); // 0 = sin expiración

    const response = await axios.post<ImgbbResponse>(IMGBB_API_URL, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000,
    });

    if (response.data.success) {
      return response.data.data.url;
    }
    return null;
  } catch (error) {
    console.error('Error subiendo a Imgbb:', error);
    return null;
  }
}

export async function uploadMultipleToImgbb(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const url = await uploadToImgbb(file);
    if (url) {
      urls.push(url);
    }
  }
  return urls;
}
