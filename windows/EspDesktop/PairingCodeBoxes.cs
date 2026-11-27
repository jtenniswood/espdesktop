using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using EspDesktop.Core;

namespace EspDesktop;

internal sealed class PairingCodeBoxes : StackPanel
{
    private readonly List<TextBox> boxes = [];
    private bool updating;

    internal event Action? CodeChanged;
    internal event Action? Submitted;
    internal bool CanChangeLength { get; private set; }

    internal PairingCodeBoxes()
    {
        Orientation = Orientation.Horizontal;
        HorizontalAlignment = HorizontalAlignment.Center;
        KeyboardNavigation.SetTabNavigation(this, KeyboardNavigationMode.Once);
        Resources.MergedDictionaries.Add(new ResourceDictionary
        {
            Source = new Uri("pack://application:,,,/EspDesktop;component/PairingCodeBoxes.xaml")
        });
        SetLength(PairingPrompt.ShortLength);
    }

    internal string? Code
    {
        get
        {
            if (boxes.Any(box => box.Text.Length != 1 || !char.IsAsciiLetter(box.Text[0]))) return null;
            var letters = string.Concat(boxes.Select(box => box.Text)).ToUpperInvariant();
            return letters.Length == PairingPrompt.LegacyLength ? letters.Insert(4, "-") : letters;
        }
    }

    internal void Reset(int? length)
    {
        CanChangeLength = length is null;
        if (boxes.Count != (length ?? PairingPrompt.ShortLength))
            SetLength(length ?? PairingPrompt.ShortLength);
        else
            SetLetters("");
    }

    internal void ChangeLength()
    {
        if (!CanChangeLength || !IsEnabled) return;
        SetLength(boxes.Count == PairingPrompt.ShortLength ? PairingPrompt.LegacyLength : PairingPrompt.ShortLength);
        FocusCode();
    }

    internal void FocusCode() => (boxes.FirstOrDefault(box => box.Text.Length == 0) ?? boxes[^1]).Focus();

    private void SetLength(int length)
    {
        Children.Clear();
        boxes.Clear();
        for (var index = 0; index < length; index++)
        {
            if (index == PairingPrompt.ShortLength)
            {
                var separator = new TextBlock
                {
                    Text = "–", Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center
                };
                Children.Add(separator);
            }

            var box = new TextBox { MaxLength = 1, CharacterCasing = CharacterCasing.Upper };
            box.SetResourceReference(StyleProperty, "PairingCodeBox");
            if (index + 1 < length) box.Margin = new Thickness(0, 0, 6, 0);
            AutomationProperties.SetName(box, $"Pairing code, letter {index + 1} of {length}");
            AutomationProperties.SetHelpText(box, "Type a letter or paste the entire pairing code.");
            var position = index;
            box.GotKeyboardFocus += (_, _) => box.SelectAll();
            box.TextChanged += (_, _) => { if (!updating) CodeChanged?.Invoke(); };
            box.PreviewTextInput += (_, args) =>
            {
                args.Handled = true;
                if (args.Text.Length != 1 || !char.IsAsciiLetter(args.Text[0])) return;
                box.Text = args.Text.ToUpperInvariant();
                FocusBox(position + 1);
            };
            box.PreviewKeyDown += (_, args) => HandleKey(position, args);
            DataObject.AddPastingHandler(box, (_, args) =>
            {
                args.CancelCommand();
                if (args.DataObject.GetData(DataFormats.UnicodeText) is string text) Paste(text);
            });
            boxes.Add(box);
            Children.Add(box);
        }
        CodeChanged?.Invoke();
    }

    private void Paste(string input)
    {
        var letters = input.Trim();
        if (letters.Length == PairingPrompt.LegacyLength + 1 && "-‐‑–—−".Contains(letters[4]))
            letters = letters.Remove(4, 1);
        if (letters.Length is not (PairingPrompt.ShortLength or PairingPrompt.LegacyLength) ||
            !letters.All(char.IsAsciiLetter)) return;
        if (letters.Length != boxes.Count)
        {
            if (!CanChangeLength) return;
            SetLength(letters.Length);
        }
        SetLetters(letters.ToUpperInvariant());
        FocusBox(boxes.Count - 1);
    }

    private void SetLetters(string letters)
    {
        updating = true;
        for (var i = 0; i < boxes.Count; i++)
            boxes[i].Text = i < letters.Length ? letters[i].ToString() : "";
        updating = false;
        CodeChanged?.Invoke();
    }

    private void HandleKey(int index, KeyEventArgs args)
    {
        switch (args.Key)
        {
            case Key.Left:
            case Key.Back when boxes[index].Text.Length == 0:
                FocusBox(index - 1);
                break;
            case Key.Right:
                FocusBox(index + 1);
                break;
            case Key.Enter:
                Submitted?.Invoke();
                break;
            default:
                return;
        }
        args.Handled = true;
    }

    private void FocusBox(int index)
    {
        var box = boxes[Math.Clamp(index, 0, boxes.Count - 1)];
        box.Focus();
        box.SelectAll();
    }
}
