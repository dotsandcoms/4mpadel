import React from 'react';
import AdvancedEventDetailsDialog from './AdvancedEventDetailsDialog';
import QuickEventDetailsDialog from './QuickEventDetailsDialog';

// Match Calendar's existing live full/quick editor split in Event Manager too.
export default function EventEditingDialog(props) {
  const Editor = props.event.is_quick_event ? QuickEventDetailsDialog : AdvancedEventDetailsDialog;
  return <Editor {...props}/>;
}
