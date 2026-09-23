import { Image } from 'expo-image';
import { SITE_ORIGIN } from '@/lib/site';
import { parseDocument } from 'htmlparser2';
import { useMemo } from 'react';
import { Alert, Linking, View } from 'react-native';
import { EventText as Text } from './website-ui';
type Node = ReturnType<typeof parseDocument>['children'][number];
const blocks = new Set(['p', 'div', 'section', 'article', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'img']);
const excluded = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']);
const base = { color: '#475569', fontSize: 12, lineHeight: 17, fontWeight: '400' as const };
/** Render published HTML as native text, preserving paragraphs, lists, emphasis and links. */
export function EventRichText({ html }: { html: string }) {
  const nodes = useMemo(() => parseDocument(html, { decodeEntities: true }).children, [html]);
  const inline = (node: Node, key: string): React.ReactNode => {
    if (node.type === 'text') return node.data;
    if (!('attribs' in node) || excluded.has(node.name)) return null;
    if (node.name === 'br') return '\n';
    const rawHref = node.attribs.href || '';
    const href = node.name === 'a' ? /^(https?:|mailto:|tel:)/i.test(rawHref) ? rawHref : rawHref.startsWith('/') && !rawHref.startsWith('//') ? `${SITE_ORIGIN}${rawHref}` : null : null;
    return <Text key={key} accessibilityRole={href ? 'link' : undefined} onPress={href ? () => void Linking.openURL(href).catch(() => Alert.alert('Link unavailable', 'Please try again.')) : undefined} style={{ ...(href ? { color: '#2563eb', textDecorationLine: 'underline' as const } : {}), ...(/^(strong|b|h[1-6])$/.test(node.name) ? { fontWeight: '400' as const } : {}), ...(/^(em|i)$/.test(node.name) ? { fontStyle: 'italic' as const } : {}) }}>{node.children.map((child, i) => inline(child, `${key}-${i}`))}</Text>;
  };
  const render = (items: Node[], prefix: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let run: Node[] = [];
    const flush = () => { if (run.some(n => n.type !== 'text' || n.data.trim())) result.push(<Text key={`${prefix}-inline-${result.length}`} selectable style={base}>{run.map((n, i) => inline(n, `${prefix}-${i}`))}</Text>); run = []; };
    items.forEach((node, index) => {
      if ('attribs' in node && excluded.has(node.name)) return;
      if (!('attribs' in node) || !blocks.has(node.name)) { run.push(node); return; }
      flush();
      const key = `${prefix}-${index}`;
      if (node.name === 'img') {
        const uri = node.attribs.src?.startsWith('/') ? `${SITE_ORIGIN}${node.attribs.src}` : node.attribs.src;
        if (/^https?:\/\//i.test(uri || '')) result.push(<Image key={key} source={{ uri }} accessibilityLabel={node.attribs.alt || ''} contentFit="contain" style={{ width: '100%', height: 180 }} />);
      } else if (node.name === 'ul' || node.name === 'ol') {
        result.push(<View key={key} style={{ gap: 5 }}>{node.children.filter(n => 'name' in n && n.name === 'li').map((li, i) => <View key={i} style={{ flexDirection: 'row', gap: 7 }}><Text style={base}>{node.name === 'ol' ? `${i + 1}.` : '•'}</Text><View style={{ flex: 1, gap: 4 }}>{render('children' in li ? li.children : [], `${key}-${i}`)}</View></View>)}</View>);
      } else if (node.name === 'tr') {
        result.push(<View key={key} style={{ flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: '#f3f4f6', paddingVertical: 6 }}>{node.children.filter(n => 'name' in n && /^(td|th)$/.test(n.name)).map((cell, i) => <View key={i} style={{ flex: 1 }}>{render('children' in cell ? cell.children : [], `${key}-${i}`)}</View>)}</View>);
      } else {
        result.push(<View key={key} style={{ gap: 6 }}>{/^h[1-6]$/.test(node.name) ? <Text style={{ ...base, fontSize: 14, lineHeight: 19, fontWeight: '400' }}>{node.children.map((n, i) => inline(n, `${key}-${i}`))}</Text> : render(node.children, key)}</View>);
      }
    });
    flush(); return result;
  };
  return <View style={{ gap: 8 }}>{render(nodes, 'content')}</View>;
}
