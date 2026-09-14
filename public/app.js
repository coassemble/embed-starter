import { EMBED_ALLOW } from './iframe-policy.js';

const frame = document.querySelector('#course');
const status = document.querySelector('#status');
const retry = document.querySelector('#retry');
frame.allow = EMBED_ALLOW;

async function openCourse() {
    status.textContent = 'Opening your course…';
    retry.hidden = true;
    frame.hidden = true;
    frame.removeAttribute('src');
    try {
        const response = await fetch('/api/embed', { method: 'POST', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        frame.src = data.url;
        frame.hidden = false;
        status.textContent = data.course.title || 'Your course';
    } catch (error) {
        status.textContent = error.message || 'Could not open your course. Try again.';
        retry.hidden = false;
    }
}

retry.addEventListener('click', openCourse);
openCourse();
