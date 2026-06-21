import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
import requests
from bs4 import BeautifulSoup

app = Flask(__name__, static_folder='public', static_url_path='')

DATA_FILE = os.path.join(os.path.dirname(__file__), 'novels.json')

def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def extract_novel_info(url):
    """簡易抓取小說標題與作者，支援主要網站，若失敗則回傳 title 為 <title>，author 為空字串。"""
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        title = ''
        author = ''
        # Open Graph title
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title = og_title['content']
        # meta author
        meta_author = soup.find('meta', attrs={'name': 'author'})
        if meta_author and meta_author.get('content'):
            author = meta_author['content']
        # Fallback to <title>
        if not title and soup.title and soup.title.string:
            title = soup.title.string.strip()
        # Site‑specific heuristics
        if 'sto.cx' in url:
            h1 = soup.find('h1')
            if h1:
                title = h1.get_text(strip=True)
            author_tag = soup.find('a', class_='author')
            if author_tag:
                author = author_tag.get_text(strip=True)
        if 'novelmad.com' in url:
            h1 = soup.find('h1')
            if h1:
                title = h1.get_text(strip=True)
            a = soup.find('span', class_='author')
            if a:
                author = a.get_text(strip=True)
        if 'qidian.com' in url or 'qidian.com' in resp.url:
            meta_name = soup.find('meta', property='og:novel:book_name')
            if meta_name and meta_name.get('content'):
                title = meta_name['content']
            meta_author = soup.find('meta', property='og:novel:author')
            if meta_author and meta_author.get('content'):
                author = meta_author['content']
        return {'title': title.strip(), 'author': author.strip()}
    except Exception as e:
        print(f'Error extracting info from {url}: {e}')
        return {'title': '', 'author': ''}

def add_or_update_novel(entry):
    data = load_data()
    for i, item in enumerate(data):
        if item.get('url') == entry.get('url'):
            data[i].update(entry)
            break
    else:
        data.append(entry)
    save_data(data)
    return data

def sort_novels(data):
    def key(item):
        rating = item.get('rating')
        rating_val = rating if isinstance(rating, (int, float)) else -1
        added = item.get('added_time')
        try:
            added_dt = datetime.fromisoformat(added)
        except Exception:
            added_dt = datetime.min
        return (-rating_val, -added_dt.timestamp())
    return sorted(data, key=key)

@app.route('/')
def root():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/novels', methods=['GET'])
def get_novels():
    data = load_data()
    return jsonify(sort_novels(data))

@app.route('/api/novel', methods=['POST'])
def post_novel():
    payload = request.get_json()
    url = payload.get('url')
    rating = payload.get('rating')
    if not url:
        return jsonify({'error': 'url required'}), 400
    info = extract_novel_info(url)
    entry = {
        'url': url,
        'title': info.get('title') or '未知作品',
        'author': info.get('author') or '未知作者',
        'added_time': datetime.now().isoformat(),
        'rating': rating
    }
    data = add_or_update_novel(entry)
    return jsonify(sort_novels(data))

@app.route('/api/batch', methods=['POST'])
def post_batch():
    payload = request.get_json()
    urls = payload.get('urls')
    if not isinstance(urls, list):
        return jsonify({'error': 'urls must be a list'}), 400
    for url in urls:
        if not isinstance(url, str):
            continue
        info = extract_novel_info(url)
        entry = {
            'url': url,
            'title': info.get('title') or '未知作品',
            'author': info.get('author') or '未知作者',
            'added_time': datetime.now().isoformat(),
            'rating': None
        }
        add_or_update_novel(entry)
    data = load_data()
    return jsonify(sort_novels(data))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
