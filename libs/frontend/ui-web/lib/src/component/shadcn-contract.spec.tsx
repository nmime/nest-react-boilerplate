import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Form,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  UiButton,
  UiCard,
  UiInput,
} from "./index";

describe("shadcn-compatible public component contract", () => {
  it("keeps canonical shadcn names behind the shared web UI facade", () => {
    expect(Button).toBe(UiButton);
    expect(Input).toBe(UiInput);
    expect(Card).not.toBe(UiCard);
    expect(DataTable).toBeTypeOf("function");
    expect(Dialog).toBeDefined();
    expect(DropdownMenu).toBeDefined();
    expect(Select).toBeDefined();
    expect(Tabs).toBeDefined();
  });

  it("marks copied-source primitives with stable shadcn data slots", () => {
    const html = renderToStaticMarkup(
      <div>
        <Button>Save</Button>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
        <Label htmlFor="name">Name</Label>
        <Form>
          <Card>
            <CardHeader>
              <CardTitle>Title</CardTitle>
              <CardDescription>Description</CardDescription>
            </CardHeader>
            <CardContent>Content</CardContent>
            <CardFooter>Footer</CardFooter>
          </Card>
        </Form>
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Check the details.</AlertDescription>
        </Alert>
        <Badge>Live</Badge>
        <Checkbox aria-label="Enabled" defaultChecked />
        <Switch aria-label="Active" defaultChecked />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Value</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
          </TabsList>
          <TabsContent value="one">Panel</TabsContent>
        </Tabs>
      </div>,
    );

    for (const slot of [
      "button",
      "input",
      "textarea",
      "label",
      "form",
      "card",
      "card-header",
      "card-title",
      "card-description",
      "card-content",
      "card-footer",
      "alert",
      "alert-title",
      "alert-description",
      "badge",
      "checkbox",
      "switch",
      "table",
      "table-header",
      "table-row",
      "table-head",
      "table-body",
      "table-cell",
      "tabs-list",
      "tabs-trigger",
      "tabs-content",
    ]) {
      expect(html).toContain(`data-slot="${slot}"`);
    }
  });

  it("keeps Radix composition parts available for generated shadcn-style code", () => {
    expect(DialogContent).toBeTypeOf("object");
    expect(DialogHeader).toBeTypeOf("function");
    expect(DialogFooter).toBeTypeOf("function");
    expect(DialogTitle).toBeTypeOf("object");
    expect(DialogDescription).toBeTypeOf("object");
    expect(DropdownMenuTrigger).toBeTypeOf("object");
    expect(DropdownMenuContent).toBeTypeOf("object");
    expect(DropdownMenuItem).toBeTypeOf("object");
    expect(SelectTrigger).toBeTypeOf("object");
    expect(SelectValue).toBeTypeOf("object");
    expect(SelectContent).toBeTypeOf("object");
    expect(SelectItem).toBeTypeOf("object");
  });
});
